import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { collection, query, orderBy, onSnapshot, getDoc, doc } from 'firebase/firestore'
import { getIdToken } from 'firebase/auth'
import { db, auth } from '@/services/firebase'
import type { ProjectFile, Message, Snapshot, GenerationState, SSEEvent } from '@/types'

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
  const streamBuffer = ref('')

  let filesUnsub: (() => void) | null = null
  let messagesUnsub: (() => void) | null = null
  let abortController: AbortController | null = null

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

  async function getToken(): Promise<string> {
    if (!auth.currentUser) throw new Error('Not authenticated')
    return getIdToken(auth.currentUser)
  }

  async function init(pid: string) {
    projectId.value = pid
    files.value = []
    messages.value = []
    activeFilePath.value = null
    streamBuffer.value = ''

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

    // Real-time messages listener
    messagesUnsub = onSnapshot(
      query(collection(db, 'projects', pid, 'messages'), orderBy('createdAt', 'asc')),
      snap => {
        messages.value = snap.docs.map(d => ({
          id: d.id,
          projectId: pid,
          role: d.data().role,
          content: d.data().content,
          createdAt: d.data().createdAt
        }))
      }
    )

    await fetchSnapshots()
  }

  async function fetchSnapshots() {
    if (!projectId.value) return
    const token = await getToken()
    const res = await fetch(`${FUNCTIONS_BASE}/listSnapshots?projectId=${projectId.value}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    snapshots.value = data.snapshots ?? []
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

  async function generate(prompt: string) {
    if (!projectId.value || generationState.value.isGenerating) return

    generationState.value = {
      isGenerating: true,
      currentFile: null,
      status: 'Starting...',
      error: null
    }
    streamBuffer.value = ''
    abortController = new AbortController()

    const token = await getToken()
    const url = `${FUNCTIONS_BASE}/generateStream?projectId=${projectId.value}&prompt=${encodeURIComponent(prompt)}`

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortController.signal
      })

      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            // handled with next data line
          } else if (line.startsWith('data: ')) {
            try {
              const event: SSEEvent = JSON.parse(line.slice(6))
              handleSSEEvent(event)
            } catch {
              // malformed event — skip
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        generationState.value.error = err instanceof Error ? err.message : 'Generation failed'
      }
    } finally {
      generationState.value.isGenerating = false
      generationState.value.currentFile = null
      await fetchSnapshots()
    }
  }

  function handleSSEEvent(event: SSEEvent) {
    switch (event.type) {
      case 'token':
        streamBuffer.value += event.text
        break
      case 'status':
        generationState.value.status = event.message
        break
      case 'file_start':
        generationState.value.currentFile = event.path
        generationState.value.status = `Writing ${event.path}...`
        break
      case 'file_end':
        generationState.value.currentFile = null
        break
      case 'complete':
        generationState.value.status = `Done — ${event.filesCount} file(s) generated`
        streamBuffer.value = ''
        // Auto-select index.html after generation
        if (files.value.find(f => f.path === 'index.html')) {
          activeFilePath.value = 'index.html'
        }
        break
      case 'error':
        generationState.value.error = event.message
        generationState.value.status = ''
        break
    }
  }

  function abortGeneration() {
    abortController?.abort()
    generationState.value.isGenerating = false
    generationState.value.status = 'Cancelled'
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
    streamBuffer,
    init,
    destroy,
    selectFile,
    saveFile,
    generate,
    abortGeneration,
    restoreSnapshot,
    fetchSnapshots
  }
})
