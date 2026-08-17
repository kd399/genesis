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

// GET /generateStream?projectId=xxx&prompt=xxx
export const generateStream = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    console.log('Received generateStream request:', req.query)

    // Set SSE headers
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

      const projectId = req.query.projectId as string
      const prompt = req.query.prompt as string

      if (!projectId || !prompt) {
        sendSSE(res, 'error', { type: 'error', message: 'projectId and prompt are required' })
        res.end()
        return
      }

      // ── Load project ──────────────────────────────────────────────────────
      sendSSE(res, 'status', { type: 'status', message: 'Loading project context...' })

      const projSnap = await db.collection('projects').doc(projectId).get()
      if (!projSnap.exists || projSnap.data()!.userId !== uid) {
        sendSSE(res, 'error', { type: 'error', message: 'Project not found' })
        res.end()
        return
      }

      const project = projSnap.data()!

      // ── Load HL connection ────────────────────────────────────────────────
      // const connSnap = await db.collection('highlevelConnections').doc(uid).get()
      // if (!connSnap.exists) {
      //   sendSSE(res, 'error', { type: 'error', message: 'HighLevel not connected' })
      //   res.end()
      //   return
      // }

      // ── Load existing files ───────────────────────────────────────────────
      sendSSE(res, 'status', { type: 'status', message: 'Gathering project files...' })

      const filesSnap = await db.collection('projects').doc(projectId).collection('files').get()

      const existingFiles = filesSnap.docs.map(d => ({
        path: d.data().path as string,
        content: d.data().content as string
      }))

      // ── Save user message ─────────────────────────────────────────────────
      await db.collection('projects').doc(projectId).collection('messages').add({
        projectId,
        role: 'user',
        content: prompt,
        createdAt: FieldValue.serverTimestamp()
      })

      // ── Build system prompt ───────────────────────────────────────────────
      const hlProxyBaseUrl = `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/highlevelProxy`

      const systemPrompt = buildSystemPrompt({
        projectName: project.name as string,
        projectDescription: project.description as string,
        locationId: project.highLevelLocationId as string,
        existingFiles,
        hlProxyBaseUrl
      })

      // ── Stream from Claude ────────────────────────────────────────────────
      sendSSE(res, 'status', { type: 'status', message: 'Generating application...' })

      let fullResponse = ''

      if(process.env.USE_HUGGINGFACE === 'true') {
        

        // Use your HF token; this client talks to the new router (OpenAI-compatible)
        const hf = new InferenceClient(process.env.HF_TOKEN!)

        const stream = hf.chatCompletionStream({
          model: 'Qwen/Qwen2.5-Coder-7B-Instruct',
          max_tokens: 4096,
          temperature: 0.7,
          top_p: 0.95,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        })

        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content ?? ''
          if (delta) {
            fullResponse += delta
            sendSSE(res, 'token', { type: 'token', text: delta })
          }
        }
      }else {
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        })

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
      sendSSE(res, 'status', { type: 'status', message: 'Processing generated files...' })

      const { operations, errors } = parseLLMResponse(fullResponse)

      if (errors.length > 0) {
        console.warn('Parse errors:', errors)
      }

      if (operations.length === 0) {
        sendSSE(res, 'error', {
          type: 'error',
          message: 'No valid file operations in response',
          savedFilesCount: 0
        })
        res.end()
        return
      }

      // ── Persist files ─────────────────────────────────────────────────────
      const batch = db.batch()

      for (const op of operations) {
        const fileId = op.path.replace(/\//g, '__')
        const fileRef = db.collection('projects').doc(projectId).collection('files').doc(fileId)

        sendSSE(res, 'file_start', { type: 'file_start', path: op.path })

        if (op.operation === 'write' && op.content !== undefined) {
          batch.set(fileRef, {
            path: op.path,
            content: op.content,
            updatedAt: FieldValue.serverTimestamp()
          })
          savedFiles.push({ path: op.path, content: op.content })
        } else if (op.operation === 'delete') {
          batch.delete(fileRef)
        }

        sendSSE(res, 'file_end', { type: 'file_end', path: op.path })
      }

      await batch.commit()

      // Update project timestamp
      await db.collection('projects').doc(projectId).update({
        updatedAt: FieldValue.serverTimestamp()
      })

      // ── Create snapshot ───────────────────────────────────────────────────
      sendSSE(res, 'status', { type: 'status', message: 'Creating snapshot...' })

      // Merge existing files with new ones for snapshot
      const allFilesMap = new Map<string, string>()
      existingFiles.forEach(f => allFilesMap.set(f.path, f.content))
      savedFiles.forEach(f => allFilesMap.set(f.path, f.content))
      // Remove deleted files
      operations.filter(op => op.operation === 'delete').forEach(op => allFilesMap.delete(op.path))

      const snapshotFiles = Array.from(allFilesMap.entries()).map(([path, content]) => ({
        path,
        content
      }))

      const snapshotId = await createSnapshot(projectId, generationId, snapshotFiles)

      // ── Save assistant message ────────────────────────────────────────────
      await db
        .collection('projects')
        .doc(projectId)
        .collection('messages')
        .add({
          projectId,
          role: 'assistant',
          content: `Generated ${savedFiles.length} file(s): ${savedFiles.map(f => f.path).join(', ')}`,
          createdAt: FieldValue.serverTimestamp()
        })

      // ── Done ──────────────────────────────────────────────────────────────
      sendSSE(res, 'complete', {
        type: 'complete',
        generationId,
        snapshotId,
        filesCount: savedFiles.length
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
