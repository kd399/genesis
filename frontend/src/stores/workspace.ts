import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { getIdToken } from 'firebase/auth'
import { db, auth } from '@/services/firebase'
import type {
  ProjectFile,
  Message,
  Snapshot,
  GenerationState,
  SSEEvent,
  ChatActivity,
  DiffViewState,
  FileDiff
} from '@/types'

const FUNCTIONS_BASE = import.meta.env.DEV
  ? `http://localhost:5001/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/us-central1`
  : `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`

export const useWorkspaceStore = defineStore('workspace', () => {
  const projectId = ref<string | null>(null)
  const files = ref<ProjectFile[]>([])
  const messages = ref<Message[]>([])
  const snapshots = ref<Snapshot[]>([])
  const activeFilePath = ref<string | null>(null)
  const generationState = ref<GenerationState>({
    isGenerating: false,
    currentFile: null,
    status: '',
    error: null
  })

  // Live streaming state
  const streamingFileContents = ref<Record<string, string>>({}) // path -> content being streamed
  const activeStreamFile = ref<string | null>(null)

  // Diff view state — shows what changed in the last generation
  const diffView = ref<DiffViewState>({
    isOpen: false,
    generationId: null,
    diffs: [],
    selectedPath: null
  })

  // The local "in-progress" assistant message id (shown while generating)
  const inProgressMsgId = ref<string | null>(null)
  // Epoch ms when current generation started — used to ignore pre-existing remote assistant msgs
  const inProgressStartTime = ref<number | null>(null)

  let filesUnsub: (() => void) | null = null
  let messagesUnsub: (() => void) | null = null
  let abortController: AbortController | null = null
  let filesBeforeGeneration: { path: string; content: string }[] = []

  const activeFile = computed(() => files.value.find(f => f.path === activeFilePath.value) ?? null)

  const fileTree = computed(() => {
    const tree: Record<string, string[]> = {}
    files.value.forEach(f => {
      const parts = f.path.split('/')
      if (parts.length === 1) {
        if (!tree['']) tree[''] = []
        tree['']!.push(f.path)
      } else {
        const dir = parts.slice(0, -1).join('/')
        if (!tree[dir]) tree[dir] = []
        tree[dir]!.push(f.path)
      }
    })
    return tree
  })

  /** The content shown in the code editor — streamed content takes priority during generation */
  const editorContent = computed(() => {
    if (
      activeStreamFile.value &&
      streamingFileContents.value[activeStreamFile.value] !== undefined
    ) {
      return streamingFileContents.value[activeStreamFile.value]
    }
    return activeFile.value?.content ?? ''
  })

  async function getToken(): Promise<string> {
    if (!auth.currentUser) throw new Error('Not authenticated')
    return getIdToken(auth.currentUser)
  }

  async function init(pid: string) {
    projectId.value = pid
    files.value = []
    messages.value = []
    activeFilePath.value = null
    streamingFileContents.value = {}
    activeStreamFile.value = null

    // Real-time files listener
    filesUnsub = onSnapshot(
      query(collection(db, 'projects', pid, 'files'), orderBy('path')),
      snap => {
        files.value = snap.docs.map(d => ({
          id: d.id,
          path: d.data().path,
          content: d.data().content,
          updatedAt: d.data().updatedAt
        }))
        // Auto-select first file
        if (!activeFilePath.value && files.value.length > 0) {
          activeFilePath.value = files.value[0]!.path
        }
      }
    )

    // Real-time messages listener — merge with local in-progress message
    messagesUnsub = onSnapshot(
      query(collection(db, 'projects', pid, 'messages'), orderBy('createdAt', 'asc')),
      snap => {
        const remote = snap.docs.map(d => ({
          id: d.id,
          projectId: pid,
          role: d.data().role,
          content: d.data().content,
          activities: d.data().activities ?? undefined,
          createdAt: d.data().createdAt
        })) as Message[]

        // If Firestore now has a NEW assistant message (created after this generation
        // started), the backend has finished — drop the local in-progress bubble.
        // We compare createdAt (Firestore Timestamp) against inProgressStartTime so
        // that pre-existing assistant messages from earlier generations are ignored.
        if (inProgressMsgId.value) {
          const startMs = inProgressStartTime.value ?? 0
          const hasNewRemoteAssistant = remote.some(m => {
            if (m.role !== 'assistant' || !m.createdAt) return false
            // Firestore Timestamp has .toMillis(); plain Date has .getTime()
            const msgMs =
              typeof (m.createdAt as any).toMillis === 'function'
                ? (m.createdAt as any).toMillis()
                : new Date(m.createdAt as any).getTime()
            return msgMs >= startMs
          })
          if (hasNewRemoteAssistant) {
            // Backend saved the real assistant message — discard local bubble
            inProgressMsgId.value = null
            inProgressStartTime.value = null
            messages.value = remote
          } else {
            // Still generating — keep local bubble at the end
            const inProgress = messages.value.find(m => m.id === inProgressMsgId.value)
            messages.value = inProgress ? [...remote, inProgress] : remote
          }
        } else {
          messages.value = remote
        }
      }
    )

    await fetchSnapshots()
  }

  async function fetchSnapshots() {
    if (!projectId.value) return
    try {
      const token = await getToken()
      const res = await fetch(`${FUNCTIONS_BASE}/listSnapshots?projectId=${projectId.value}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      snapshots.value = data.snapshots ?? []
    } catch {
      // non-fatal
    }
  }

  function selectFile(path: string) {
    activeFilePath.value = path
  }

  async function saveFile(path: string, content: string) {
    const token = await getToken()
    await fetch(`${FUNCTIONS_BASE}/saveFile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: projectId.value, path, content })
    })
  }

  /** Compute diffs between previous file set and current file set */
  function computeDiffs(
    before: { path: string; content: string }[],
    after: { path: string; content: string }[],
    generationId: string
  ) {
    const beforeMap = new Map(before.map(f => [f.path, f.content]))
    const afterMap = new Map(after.map(f => [f.path, f.content]))
    const allPaths = new Set([...beforeMap.keys(), ...afterMap.keys()])

    const diffs: FileDiff[] = []
    allPaths.forEach(path => {
      const b = beforeMap.get(path) ?? ''
      const a = afterMap.get(path) ?? ''
      if (!beforeMap.has(path)) {
        diffs.push({ path, status: 'added', before: '', after: a })
      } else if (!afterMap.has(path)) {
        diffs.push({ path, status: 'deleted', before: b, after: '' })
      } else if (b !== a) {
        diffs.push({ path, status: 'modified', before: b, after: a })
      }
      // unchanged files intentionally excluded — not useful to show
    })

    // Sort: added first, then modified, then deleted
    const order = { added: 0, modified: 1, deleted: 2, unchanged: 3 }
    diffs.sort((a, b) => order[a.status] - order[b.status] || a.path.localeCompare(b.path))

    diffView.value = {
      isOpen: diffs.length > 0,
      generationId,
      diffs,
      selectedPath: diffs[0]?.path ?? null
    }
  }

  function closeDiffView() {
    diffView.value = { ...diffView.value, isOpen: false }
  }

  function selectDiffFile(path: string) {
    diffView.value = { ...diffView.value, selectedPath: path }
  }

  async function generate(prompt: string) {
    if (!projectId.value || generationState.value.isGenerating) return

    generationState.value = {
      isGenerating: true,
      currentFile: null,
      status: 'Starting...',
      error: null
    }
    streamingFileContents.value = {}
    activeStreamFile.value = null
    abortController = new AbortController()

    // Snapshot current files BEFORE generation to compute diff afterward
    filesBeforeGeneration = files.value.map(f => ({ path: f.path, content: f.content }))

    // 1) Add user message immediately (local + Firestore)
    const userMsg: Message = {
      id: `local_user_${Date.now()}`,
      projectId: projectId.value,
      role: 'user',
      content: prompt,
      createdAt: null as any
    }
    messages.value = [...messages.value, userMsg]

    // 2) Create a local in-progress assistant message bubble
    // Add an initial 'status' activity immediately so the chat shows
    // something is happening even before the first SSE event arrives.
    const assistantMsgId = `local_asst_${Date.now()}`
    inProgressMsgId.value = assistantMsgId
    // Record the wall-clock time so the Firestore listener can tell old vs new assistant msgs
    inProgressStartTime.value = Date.now()
    const assistantMsg: Message = {
      id: assistantMsgId,
      projectId: projectId.value,
      role: 'assistant',
      content: '',
      activities: [{ kind: 'status', label: 'Loading project…' }],
      createdAt: null as any
    }
    messages.value = [...messages.value, assistantMsg]

    const token = await getToken()
    const url = `${FUNCTIONS_BASE}/generateStream`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ projectId: projectId.value, prompt }),
        signal: abortController.signal
      })

      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let eventType = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            try {
              const event: SSEEvent = JSON.parse(line.slice(6))
              handleSSEEvent(event)
            } catch {
              // malformed — skip
            }
            eventType = ''
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const errMsg = err instanceof Error ? err.message : 'Generation failed'
        generationState.value.error = errMsg
        // Update assistant bubble with error
        updateInProgressMessage(msg => {
          msg.activities = [...(msg.activities ?? []), { kind: 'status', label: `❌ ${errMsg}` }]
        })
      }
    } finally {
      generationState.value.isGenerating = false
      generationState.value.currentFile = null
      activeStreamFile.value = null
      // Firestore listener will clear inProgressMsgId when remote assistant message arrives
      // Set a 5s safety-net timeout in case the listener misses the event
      setTimeout(() => {
        inProgressMsgId.value = null
        inProgressStartTime.value = null
      }, 5000)
      await fetchSnapshots()
    }
  }

  function updateInProgressMessage(updater: (msg: Message) => void) {
    if (!inProgressMsgId.value) return
    const idx = messages.value.findIndex(m => m.id === inProgressMsgId.value)
    if (idx === -1) return
    const updated = { ...messages.value[idx]! }
    updater(updated)
    messages.value = [...messages.value.slice(0, idx), updated, ...messages.value.slice(idx + 1)]
  }

  function addActivity(activity: ChatActivity) {
    updateInProgressMessage(msg => {
      msg.activities = [...(msg.activities ?? []), activity]
    })
  }

  function handleSSEEvent(event: SSEEvent) {
    switch (event.type) {
      case 'status':
        generationState.value.status = event.message
        // Update the last status activity instead of adding a new one each time
        // to avoid flooding the chat with "Generating... 500 chars" messages
        updateInProgressMessage(msg => {
          const acts = msg.activities ?? []
          const lastIdx = acts.length - 1
          if (lastIdx >= 0 && acts[lastIdx]!.kind === 'status') {
            // Replace last status
            msg.activities = [...acts.slice(0, lastIdx), { kind: 'status', label: event.message }]
          } else {
            msg.activities = [...acts, { kind: 'status', label: event.message }]
          }
        })
        break

      case 'activity':
        addActivity({ kind: event.kind, label: event.label, path: event.path })
        break

      case 'file_start': {
        const path = event.path
        generationState.value.currentFile = path
        generationState.value.status = `Writing ${path}...`
        streamingFileContents.value = { ...streamingFileContents.value, [path]: '' }
        activeStreamFile.value = path
        activeFilePath.value = path
        break
      }

      case 'token': {
        if (activeStreamFile.value) {
          streamingFileContents.value = {
            ...streamingFileContents.value,
            [activeStreamFile.value]:
              (streamingFileContents.value[activeStreamFile.value] ?? '') + event.text
          }
        }
        break
      }

      case 'file_end':
        generationState.value.currentFile = null
        activeStreamFile.value = null
        break

      case 'complete': {
        generationState.value.status = `Done — ${event.filesCount} file(s) generated`
        const summary = event.summary || `Generated ${event.filesCount} file(s) successfully.`
        updateInProgressMessage(msg => {
          msg.content = summary
          // Remove all status activities, keep file_read/write, add summary
          msg.activities = [
            ...(msg.activities ?? []).filter(a => a.kind !== 'status'),
            { kind: 'summary', label: summary }
          ]
        })
        // Auto-select index.html after generation
        if (files.value.find(f => f.path === 'index.html')) {
          activeFilePath.value = 'index.html'
        }
        // Compute diff — use streamed file contents since Firestore may not have updated yet
        const filesAfter = [
          ...files.value
            .filter(f => !streamingFileContents.value[f.path])
            .map(f => ({ path: f.path, content: f.content })),
          ...Object.entries(streamingFileContents.value).map(([path, content]) => ({
            path,
            content
          }))
        ]
        // Skip diff on first generation — nothing to compare against
        if (filesBeforeGeneration.length > 0) {
          computeDiffs(filesBeforeGeneration, filesAfter, event.generationId)
        }
        break
      }

      case 'error':
        generationState.value.error = event.message
        generationState.value.status = ''
        addActivity({ kind: 'status', label: `❌ ${event.message}` })
        break
    }
  }

  function abortGeneration() {
    abortController?.abort()
    generationState.value.isGenerating = false
    generationState.value.status = 'Cancelled'
    activeStreamFile.value = null
  }

  async function restoreSnapshot(snapshotId: string) {
    const token = await getToken()
    await fetch(`${FUNCTIONS_BASE}/restoreSnapshot`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: projectId.value, snapshotId })
    })
    await fetchSnapshots()
  }

  function destroy() {
    filesUnsub?.()
    messagesUnsub?.()
    abortController?.abort()
    projectId.value = null
    files.value = []
    messages.value = []
    snapshots.value = []
    streamingFileContents.value = {}
    activeStreamFile.value = null
    inProgressMsgId.value = null
    inProgressStartTime.value = null
  }

  return {
    projectId,
    files,
    messages,
    snapshots,
    activeFilePath,
    activeFile,
    fileTree,
    generationState,
    editorContent,
    activeStreamFile,
    streamingFileContents,
    init,
    destroy,
    selectFile,
    saveFile,
    generate,
    abortGeneration,
    restoreSnapshot,
    fetchSnapshots,
    diffView,
    closeDiffView,
    selectDiffFile
  }
})
