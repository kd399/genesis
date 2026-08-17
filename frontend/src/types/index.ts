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

export interface Message {
  id: string
  projectId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Timestamp
}

// ─── SSE Event Protocol ──────────────────────────────────────────────────────

export type SSEEventType = 'token' | 'file_start' | 'file_end' | 'complete' | 'error' | 'status'

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

export type SSEEvent =
  | SSETokenEvent
  | SSEFileStartEvent
  | SSEFileEndEvent
  | SSECompleteEvent
  | SSEErrorEvent
  | SSEStatusEvent

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
