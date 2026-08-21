import type { Timestamp } from 'firebase/firestore'

// ─── User ───────────────────────────────────────────────────────────────────

export interface User {
  uid: string
  email: string | null
  displayName: string | null
}

// ─── HighLevel Connection ────────────────────────────────────────────────────

export interface HighLevelConnection {
  id: string
  userId: string
  locationId: string
  locationName: string
  accessToken: string
  refreshToken: string
  expiresAt: Timestamp
  createdAt: Timestamp
}

// ─── Project ─────────────────────────────────────────────────────────────────

export interface Project {
  id: string
  userId: string
  name: string
  description: string
  highLevelLocationId: string
  createdAt: Timestamp
  updatedAt: Timestamp
  deletedAt?: Timestamp
}

export interface CreateProjectInput {
  name: string
  description: string
  highLevelLocationId: string
}

// ─── File ────────────────────────────────────────────────────────────────────

export interface ProjectFile {
  id: string
  path: string
  content: string
  updatedAt: Timestamp
}

export interface FileOperation {
  operation: 'write' | 'delete'
  path: string
  content?: string
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

export interface FileSnapshot {
  path: string
  content: string
}

export interface Snapshot {
  id: string
  projectId: string
  generationId: string
  files: FileSnapshot[]
  createdAt: Timestamp
}

// ─── Message ─────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant'

export interface ChatActivity {
  kind: 'status' | 'file_read' | 'file_write' | 'file_delete' | 'summary'
  label: string
  /** file path — only on file_* kinds */
  path?: string
}

export interface Message {
  id: string
  projectId: string
  role: MessageRole
  content: string
  /** Rich activity steps shown under an assistant bubble while/after generating */
  activities?: ChatActivity[]
  createdAt: Timestamp
}

// ─── SSE Event Protocol ──────────────────────────────────────────────────────

export type SSEEventType =
  'token' | 'file_start' | 'file_end' | 'complete' | 'error' | 'status' | 'activity'

export interface SSETokenEvent {
  type: 'token'
  text: string
}

export interface SSEFileStartEvent {
  type: 'file_start'
  path: string
}

export interface SSEFileEndEvent {
  type: 'file_end'
  path: string
}

export interface SSECompleteEvent {
  type: 'complete'
  generationId: string
  snapshotId: string
  filesCount: number
  summary: string
}

export interface SSEErrorEvent {
  type: 'error'
  message: string
  savedFilesCount?: number
}

export interface SSEStatusEvent {
  type: 'status'
  message: string
}

/** Rich activity events used to build the chat assistant bubble in real-time */
export interface SSEActivityEvent {
  type: 'activity'
  kind: ChatActivity['kind']
  label: string
  path?: string
}

export type SSEEvent =
  | SSETokenEvent
  | SSEFileStartEvent
  | SSEFileEndEvent
  | SSECompleteEvent
  | SSEErrorEvent
  | SSEStatusEvent
  | SSEActivityEvent

// ─── Generation ──────────────────────────────────────────────────────────────

export interface GenerationRequest {
  projectId: string
  prompt: string
}

export interface GenerationState {
  isGenerating: boolean
  currentFile: string | null
  status: string
  error: string | null
}

// ─── Diff View ───────────────────────────────────────────────────────────────

export interface FileDiff {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'unchanged'
  before: string // content before generation (empty if added)
  after: string // content after generation (empty if deleted)
}

export interface DiffViewState {
  isOpen: boolean
  generationId: string | null
  diffs: FileDiff[]
  selectedPath: string | null
}
