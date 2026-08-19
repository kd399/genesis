import * as functions from 'firebase-functions'
import Anthropic from '@anthropic-ai/sdk'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../admin'
import { verifyAuth } from '../auth/middleware'
import { buildSystemPrompt } from './prompt'
import { parseLLMResponse, type FileOperation } from './parser'
import { createSnapshot } from '../snapshots'
import { InferenceClient } from '@huggingface/inference'
import { setCors } from '../cors'

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function sendSSE(res: functions.Response, eventType: string, data: unknown) {
  res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
}

function sendActivity(
  res: functions.Response,
  kind: 'status' | 'file_read' | 'file_write' | 'file_delete' | 'summary',
  label: string,
  path?: string
) {
  sendSSE(res, 'activity', { type: 'activity', kind, label, path })
}

// ─── Real-time delimiter-stream parser ───────────────────────────────────────
// Detects <<<FILE:path>>> ... <<<END_FILE>>> blocks as tokens stream in.
// Sends file_start / token (content only) / file_end events in real time.

class DelimiterStreamParser {
  private buf = ''
  private inFile = false
  private currentPath = ''
  private fileContent = ''
  readonly operations: FileOperation[] = []

  constructor(private readonly res: functions.Response) {}

  /** Feed the next raw token chunk. Returns consumed text. */
  feed(text: string) {
    this.buf += text

    while (true) {
      if (!this.inFile) {
        // Scan for <<<FILE:...>>>
        const start = this.buf.indexOf('<<<FILE:')
        if (start === -1) {
          // No marker yet — but keep last 20 chars in case it's mid-marker
          if (this.buf.length > 20) this.buf = this.buf.slice(-20)
          break
        }
        const end = this.buf.indexOf('>>>', start + 8)
        if (end === -1) break // incomplete marker — wait for more tokens

        this.currentPath = this.buf.slice(start + 8, end).trim()
        this.buf = this.buf.slice(end + 3) // skip past >>>
        if (this.buf.startsWith('\n')) this.buf = this.buf.slice(1) // skip leading newline

        this.fileContent = ''
        this.inFile = true
        sendSSE(this.res, 'file_start', { type: 'file_start', path: this.currentPath })
        sendActivity(this.res, 'file_write', `Writing ${this.currentPath}`, this.currentPath)
      } else {
        // Scan for <<<END_FILE>>>
        const endIdx = this.buf.indexOf('<<<END_FILE>>>')
        if (endIdx === -1) {
          // No end marker — stream safe content (keep last 20 chars as potential partial marker)
          const safeLen = Math.max(0, this.buf.length - 20)
          if (safeLen > 0) {
            let chunk = this.buf.slice(0, safeLen)
            // Strip leading newline from very first content of each file
            if (this.fileContent === '' && chunk.startsWith('\n')) chunk = chunk.slice(1)
            if (chunk) {
              this.fileContent += chunk
              sendSSE(this.res, 'token', { type: 'token', text: chunk })
            }
            this.buf = this.buf.slice(safeLen)
          }
          break
        }

        // Stream the remaining content before the end marker
        let lastChunk = this.buf.slice(0, endIdx)
        // Strip leading newline if this is the first content written to this file
        if (this.fileContent === '' && lastChunk.startsWith('\n')) lastChunk = lastChunk.slice(1)
        // Strip trailing newline before <<<END_FILE>>>
        const trimmedChunk = lastChunk.endsWith('\n') ? lastChunk.slice(0, -1) : lastChunk
        if (trimmedChunk) {
          this.fileContent += trimmedChunk
          sendSSE(this.res, 'token', { type: 'token', text: trimmedChunk })
        }

        this.operations.push({
          operation: 'write',
          path: this.currentPath,
          content: this.fileContent
        })
        sendSSE(this.res, 'file_end', { type: 'file_end', path: this.currentPath })

        this.buf = this.buf.slice(endIdx + 14) // skip past <<<END_FILE>>>
        this.inFile = false
        this.currentPath = ''
        this.fileContent = ''
      }
    }
  }

  /** Flush any remaining buffered content when stream ends */
  flush() {
    if (this.inFile && this.fileContent) {
      // Unclosed file block — treat as complete anyway
      this.operations.push({
        operation: 'write',
        path: this.currentPath,
        content: this.fileContent + this.buf
      })
      sendSSE(this.res, 'file_end', { type: 'file_end', path: this.currentPath })
    }
  }
}

// ─── Main generateStream function ────────────────────────────────────────────

export const generateStream = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    if (setCors(res, req)) return // handles OPTIONS and sets headers

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.status(200)

    const generationId = `gen_${Date.now()}`
    let savedFilesCount = 0

    try {
      // ── Auth ──────────────────────────────────────────────────────────────
      const uid = await verifyAuth(req)

      // Accept both POST body and query params
      const body = (req.body ?? {}) as Record<string, string>
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
        existingFiles.forEach(f => sendActivity(res, 'file_read', `Reading ${f.path}`, f.path))
      }

      // ── Load prior conversation history (last 10 turns for context) ───────
      const priorMsgsSnap = await db
        .collection('projects')
        .doc(projectId)
        .collection('messages')
        .orderBy('createdAt', 'asc')
        .limitToLast(10)
        .get()

      // Only keep role+content, filter out:
      // 1. Empty messages
      // 2. Assistant summary messages (plain English like "Generated 1 file...")
      //    These are stored as chat UI labels, NOT as LLM output — sending them
      //    back as assistant turns causes the LLM to reply in plain English
      //    instead of producing JSON/delimiter file output.
      const assistantSummaryRe = /^(Generated|Updated)\s+\d+\s+file/i

      const conversationHistory = priorMsgsSnap.docs
        .map(d => ({
          role: d.data().role as 'user' | 'assistant',
          content: (d.data().content as string) || ''
        }))
        .filter(m => {
          if (!m.content.trim()) return false
          // Drop assistant summary messages — they are UI labels, not LLM output
          if (m.role === 'assistant' && assistantSummaryRe.test(m.content.trim())) return false
          return true
        })

      // ── Save user message ─────────────────────────────────────────────────
      await db.collection('projects').doc(projectId).collection('messages').add({
        projectId,
        role: 'user',
        content: prompt,
        createdAt: FieldValue.serverTimestamp()
      })

      // ── Build prompts ─────────────────────────────────────────────────────
      const useHuggingFace = process.env.USE_HUGGINGFACE === 'true'

      const hlProxyBaseUrl = process.env.FUNCTIONS_BASE_URL
        ? `${process.env.FUNCTIONS_BASE_URL}/highlevelProxy`
        : `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/highlevelProxy`

      const systemPrompt = buildSystemPrompt({
        projectName: project.name as string,
        projectDescription: project.description as string,
        locationId: project.highLevelLocationId as string,
        existingFiles,
        hlProxyBaseUrl,
        useDelimiterFormat: useHuggingFace
      })

      // ── Stream from LLM ───────────────────────────────────────────────────
      sendActivity(res, 'status', 'Generating application code…')

      let fullResponse = ''
      let streamOperations: FileOperation[] = []

      if (useHuggingFace) {
        // ── HuggingFace path: real-time delimiter parsing ─────────────────
        const parser = new DelimiterStreamParser(res)
        const hf = new InferenceClient(process.env.HF_TOKEN!)

        const stream = hf.chatCompletionStream({
          model: 'Qwen/Qwen2.5-Coder-7B-Instruct',
          max_tokens: 4096,
          temperature: 0.3,
          top_p: 0.95,
          messages: [
            { role: 'system', content: systemPrompt },
            // Prior conversation turns for context
            ...conversationHistory.reduce(
              (acc: { role: 'user' | 'assistant'; content: string }[], m) => {
                if (acc.length === 0 || acc[acc.length - 1]!.role !== m.role) acc.push(m)
                return acc
              },
              []
            ),
            { role: 'user', content: prompt }
          ]
        })

        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content ?? ''
          if (delta) {
            fullResponse += delta
            parser.feed(delta)
          }
        }

        parser.flush()
        streamOperations = parser.operations

        // If real-time parser got no operations, fall back to full-response parse
        if (streamOperations.length === 0) {
          const { operations } = parseLLMResponse(fullResponse)
          streamOperations = operations
        }
      } else {
        // ── Anthropic path ────────────────────────────────────────────────
        // We accumulate the full response silently (no raw token streaming to
        // frontend — the LLM outputs JSON which looks ugly mid-stream and
        // confuses the editor tabs). Progress is shown via activity events.
        // After parsing, we stream each file's content char-by-char so the
        // editor shows a smooth "writing" effect.
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

        // Build messages: prior turns + current user prompt
        // Also strip any prior assistant messages that look like delimiter format —
        // they confuse the model into outputting <<<FILE:..>>> instead of JSON.
        const delimiterRe = /<<<(?:FILE|END_FILE|DELETE)/
        const historyMessages: { role: 'user' | 'assistant'; content: string }[] = []
        for (const m of conversationHistory) {
          if (
            historyMessages.length > 0 &&
            historyMessages[historyMessages.length - 1]!.role === m.role
          )
            continue
          // Drop assistant messages that contain delimiter syntax — they teach
          // the LLM to use that format instead of JSON.
          if (m.role === 'assistant' && delimiterRe.test(m.content)) continue
          historyMessages.push({ role: m.role, content: m.content })
        }
        if (
          historyMessages.length === 0 ||
          historyMessages[historyMessages.length - 1]!.role === 'assistant'
        ) {
          historyMessages.push({ role: 'user', content: prompt })
        } else {
          historyMessages[historyMessages.length - 1] = { role: 'user', content: prompt }
        }

        // Anthropic prefill trick: append an assistant turn starting with "["
        // This FORCES the model to continue in JSON array format — it cannot
        // switch to delimiter or markdown because it already "started" with [
        historyMessages.push({ role: 'assistant', content: '[' })

        const stream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: systemPrompt,
          messages: historyMessages
        })

        // Track approximate progress for the activity log
        let charCount = 0
        const PROGRESS_INTERVAL = 800

        // Prefill "[" is already the start — prepend it to fullResponse
        fullResponse = '['

        // Send initial "thinking" status immediately so chat shows activity
        sendSSE(res, 'status', { type: 'status', message: 'Thinking…' })

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullResponse += chunk.delta.text
            charCount += chunk.delta.text.length
            // Send periodic progress so chat bubble updates live
            if (charCount % PROGRESS_INTERVAL < chunk.delta.text.length) {
              const kb = (charCount / 1024).toFixed(1)
              sendSSE(res, 'status', { type: 'status', message: `Generating… ${kb}kb written` })
            }
          }
        }

        // Parse the completed response
        const { operations, errors } = parseLLMResponse(fullResponse)
        if (errors.length > 0) console.warn('Parse warnings:', errors)
        if (operations.length > 0) {
          const usedMarkdown = errors.some(e => e.includes('markdown blocks'))
          if (usedMarkdown) {
            console.warn(
              '⚠️  LLM used markdown fences instead of JSON — extracted via fallback parser.'
            )
          }
        }
        streamOperations = operations

        // Stream each file's content to the editor with a smooth character effect
        const CHUNK_SIZE = 80
        for (const op of streamOperations) {
          if (op.operation === 'write') {
            sendSSE(res, 'file_start', { type: 'file_start', path: op.path })
            sendActivity(res, 'file_write', `Writing ${op.path}`, op.path)
            const content = op.content ?? ''
            // Send in chunks so editor shows a typewriter effect
            for (let i = 0; i < content.length; i += CHUNK_SIZE) {
              sendSSE(res, 'token', { type: 'token', text: content.slice(i, i + CHUNK_SIZE) })
            }
            sendSSE(res, 'file_end', { type: 'file_end', path: op.path })
          }
        }
      }

      // ── Validate we have operations ───────────────────────────────────────
      if (streamOperations.length === 0) {
        const tail = fullResponse.slice(-300)
        console.error('No operations parsed. Response tail:', JSON.stringify(tail))
        // Check if the response looks like delimiter format was used unexpectedly
        const hasDelimiter =
          fullResponse.includes('<<<FILE:') || fullResponse.includes('<<<END_FILE>>>')
        const hasJsonStart = fullResponse.trimStart().startsWith('[')
        console.error(
          'Response format hints — hasDelimiter:',
          hasDelimiter,
          'hasJsonStart:',
          hasJsonStart
        )
        sendSSE(res, 'error', {
          type: 'error',
          message: 'The model did not generate any files. Try rephrasing your prompt.',
          savedFilesCount: 0
        })
        res.end()
        return
      }

      // ── Persist files to Firestore ────────────────────────────────────────
      sendActivity(res, 'status', 'Saving files…')
      const batch = db.batch()
      const savedFiles: { path: string; content: string }[] = []

      for (const op of streamOperations) {
        // Guard: op.path must look like a real file path, not HTML/code content.
        // If LLM mixes delimiter + JSON formats, the path field can contain the
        // entire file content — Firestore doc IDs max out at 1500 bytes and crash.
        const isValidPath =
          op.path.length <= 200 && // reasonable path length
          /\.[a-z]{1,5}$/i.test(op.path) && // must end with an extension
          !op.path.includes('<') && // no HTML tags
          !op.path.includes('\n') // no newlines

        if (!isValidPath) {
          console.warn('Skipping op with invalid path (likely parse error):', op.path.slice(0, 80))
          continue
        }

        const fileId = op.path.replace(/\//g, '__')
        const fileRef = db.collection('projects').doc(projectId).collection('files').doc(fileId)

        if (op.operation === 'write' && op.content !== undefined) {
          batch.set(fileRef, {
            path: op.path,
            content: op.content,
            updatedAt: FieldValue.serverTimestamp()
          })
          savedFiles.push({ path: op.path, content: op.content })
        } else if (op.operation === 'delete') {
          sendActivity(res, 'file_delete', `Deleting ${op.path}`, op.path)
          batch.delete(fileRef)
        }
      }

      await batch.commit()
      savedFilesCount = savedFiles.length

      await db.collection('projects').doc(projectId).update({
        updatedAt: FieldValue.serverTimestamp()
      })

      // ── Create snapshot ───────────────────────────────────────────────────
      sendActivity(res, 'status', 'Creating snapshot…')
      const allFilesMap = new Map<string, string>()
      existingFiles.forEach(f => allFilesMap.set(f.path, f.content))
      savedFiles.forEach(f => allFilesMap.set(f.path, f.content))
      streamOperations
        .filter(op => op.operation === 'delete')
        .forEach(op => allFilesMap.delete(op.path))

      const snapshotFiles = Array.from(allFilesMap.entries()).map(([path, content]) => ({
        path,
        content
      }))
      const snapshotId = await createSnapshot(projectId, generationId, snapshotFiles)

      // ── Build & persist assistant message ─────────────────────────────────
      const writtenPaths = savedFiles.map(f => f.path)
      const summary = buildSummary(writtenPaths, existingFiles.length > 0)

      const activities = [
        ...(existingFiles.length > 0
          ? existingFiles.map(f => ({ kind: 'file_read', label: `Read ${f.path}`, path: f.path }))
          : []),
        ...writtenPaths.map(p => ({ kind: 'file_write', label: `Wrote ${p}`, path: p })),
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
        filesCount: savedFilesCount,
        summary
      })

      res.end()
    } catch (err) {
      console.error('Generation error:', err)
      sendSSE(res, 'error', {
        type: 'error',
        message: err instanceof Error ? err.message : 'Generation failed',
        savedFilesCount
      })
      res.end()
    }
  })

function buildSummary(files: string[], isUpdate: boolean): string {
  const action = isUpdate ? 'Updated' : 'Generated'
  const fileList =
    files.length <= 3
      ? files.join(', ')
      : `${files.slice(0, 2).join(', ')} and ${files.length - 2} more`
  return `${action} ${files.length} file${files.length !== 1 ? 's' : ''} (${fileList}). Your app is ready in the Preview panel.`
}
