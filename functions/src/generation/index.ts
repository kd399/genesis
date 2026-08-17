import * as functions from 'firebase-functions'
import Anthropic from '@anthropic-ai/sdk'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../admin'
import { verifyAuth } from '../auth/middleware'
import { buildSystemPrompt } from './prompt'
import { parseLLMResponse } from './parser'
import { createSnapshot } from '../snapshots'
import { InferenceClient } from '@huggingface/inference'

// SSE helper
function sendSSE(res: functions.Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// Activity event shorthand
function sendActivity(
  res: functions.Response,
  kind: 'status' | 'file_read' | 'file_write' | 'file_delete' | 'summary',
  label: string,
  path?: string
) {
  sendSSE(res, 'activity', { type: 'activity', kind, label, path })
}

export const generateStream = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.status(200)

    const generationId = `gen_${Date.now()}`
    const savedFiles: { path: string; content: string }[] = []

    try {
      // ── Auth ──────────────────────────────────────────────────────────────
      const uid = await verifyAuth(req)
      // Accept both POST body and query params
      const body = req.body ?? {}
      const projectId = (body.projectId ?? req.query.projectId) as string
      const prompt = (body.prompt ?? req.query.prompt) as string

      if (!projectId || !prompt) {
        sendSSE(res, 'error', { type: 'error', message: 'projectId and prompt are required' })
        res.end()
        return
      }

      // ── Load project ──────────────────────────────────────────────────────
      sendActivity(res, 'status', 'Loading project…')
      const projSnap = await db.collection('projects').doc(projectId).get()
      if (!projSnap.exists || projSnap.data()!.userId !== uid) {
        sendSSE(res, 'error', { type: 'error', message: 'Project not found' })
        res.end()
        return
      }
      const project = projSnap.data()!

      // ── Load existing files ───────────────────────────────────────────────
      sendActivity(res, 'status', 'Reading existing files…')
      const filesSnap = await db.collection('projects').doc(projectId).collection('files').get()
      const existingFiles = filesSnap.docs.map(d => ({
        path: d.data().path as string,
        content: d.data().content as string
      }))

      if (existingFiles.length > 0) {
        existingFiles.forEach(f => {
          sendActivity(res, 'file_read', `Reading ${f.path}`, f.path)
        })
      }

      // ── Save user message ─────────────────────────────────────────────────
      await db.collection('projects').doc(projectId).collection('messages').add({
        projectId,
        role: 'user',
        content: prompt,
        createdAt: FieldValue.serverTimestamp()
      })

      // ── Build system prompt ───────────────────────────────────────────────
      const hlProxyBaseUrl = process.env.FUNCTIONS_BASE_URL
        ? `${process.env.FUNCTIONS_BASE_URL}/highlevelProxy`
        : `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/highlevelProxy`

      const systemPrompt = buildSystemPrompt({
        projectName: project.name as string,
        projectDescription: project.description as string,
        locationId: project.highLevelLocationId as string,
        existingFiles,
        hlProxyBaseUrl
      })

      // ── Stream from LLM ───────────────────────────────────────────────────
      sendActivity(res, 'status', 'Generating application code…')

      let fullResponse = ''

      if (process.env.USE_HUGGINGFACE === 'true') {
        const hf = new InferenceClient(process.env.HF_TOKEN!)
        const stream = hf.chatCompletionStream({
          model: 'Qwen/Qwen2.5-Coder-7B-Instruct',
          max_tokens: 4096,
          temperature: 0.7,
          top_p: 0.95,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ]
        })
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content ?? ''
          if (delta) {
            fullResponse += delta
            sendSSE(res, 'token', { type: 'token', text: delta })
          }
        }
      } else {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        const stream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }]
        })
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const text = chunk.delta.text
            fullResponse += text
            sendSSE(res, 'token', { type: 'token', text })
          }
        }
      }

      // ── Parse LLM response ────────────────────────────────────────────────
      sendActivity(res, 'status', 'Processing generated files…')
      const { operations, errors } = parseLLMResponse(fullResponse)

      if (errors.length > 0) console.warn('Parse errors:', errors)

      if (operations.length === 0) {
        sendSSE(res, 'error', {
          type: 'error',
          message: 'No valid file operations found in LLM response. Try rephrasing your prompt.',
          savedFilesCount: 0
        })
        res.end()
        return
      }

      // ── Persist files (one by one with SSE events) ───────────────────────
      const batch = db.batch()

      for (const op of operations) {
        const fileId = op.path.replace(/\//g, '__')
        const fileRef = db.collection('projects').doc(projectId).collection('files').doc(fileId)

        if (op.operation === 'write' && op.content !== undefined) {
          sendSSE(res, 'file_start', { type: 'file_start', path: op.path })
          sendActivity(res, 'file_write', `Writing ${op.path}`, op.path)

          batch.set(fileRef, {
            path: op.path,
            content: op.content,
            updatedAt: FieldValue.serverTimestamp()
          })
          savedFiles.push({ path: op.path, content: op.content })

          sendSSE(res, 'file_end', { type: 'file_end', path: op.path })
        } else if (op.operation === 'delete') {
          sendActivity(res, 'file_delete', `Deleting ${op.path}`, op.path)
          batch.delete(fileRef)
        }
      }

      await batch.commit()

      // Update project timestamp
      await db.collection('projects').doc(projectId).update({
        updatedAt: FieldValue.serverTimestamp()
      })

      // ── Snapshot ──────────────────────────────────────────────────────────
      sendActivity(res, 'status', 'Creating snapshot…')
      const allFilesMap = new Map<string, string>()
      existingFiles.forEach(f => allFilesMap.set(f.path, f.content))
      savedFiles.forEach(f => allFilesMap.set(f.path, f.content))
      operations.filter(op => op.operation === 'delete').forEach(op => allFilesMap.delete(op.path))
      const snapshotFiles = Array.from(allFilesMap.entries()).map(([path, content]) => ({
        path,
        content
      }))
      const snapshotId = await createSnapshot(projectId, generationId, snapshotFiles)

      // ── Build summary message ─────────────────────────────────────────────
      const writtenPaths = savedFiles.map(f => f.path)
      const summary = buildSummary(prompt, writtenPaths, existingFiles.length > 0)

      // Persist assistant message with activities array
      const activities = [
        ...existingFiles.map(f => ({
          kind: 'file_read',
          label: `Reading ${f.path}`,
          path: f.path
        })),
        ...writtenPaths.map(p => ({ kind: 'file_write', label: `Writing ${p}`, path: p })),
        { kind: 'summary', label: summary }
      ]

      await db.collection('projects').doc(projectId).collection('messages').add({
        projectId,
        role: 'assistant',
        content: summary,
        activities,
        createdAt: FieldValue.serverTimestamp()
      })

      // ── Done ──────────────────────────────────────────────────────────────
      sendActivity(res, 'summary', summary)
      sendSSE(res, 'complete', {
        type: 'complete',
        generationId,
        snapshotId,
        filesCount: savedFiles.length,
        summary
      })

      res.end()
    } catch (err) {
      console.error('Generation error:', err)
      sendSSE(res, 'error', {
        type: 'error',
        message: err instanceof Error ? err.message : 'Generation failed',
        savedFilesCount: savedFiles.length
      })
      res.end()
    }
  })

function buildSummary(prompt: string, files: string[], isUpdate: boolean): string {
  const action = isUpdate ? 'Updated' : 'Generated'
  const fileList =
    files.length <= 3
      ? files.join(', ')
      : `${files.slice(0, 2).join(', ')} and ${files.length - 2} more file${files.length - 2 > 1 ? 's' : ''}`
  return `${action} ${files.length} file${files.length !== 1 ? 's' : ''} (${fileList}). Your app is ready in the preview panel.`
}
