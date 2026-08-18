export interface FileOperation {
  operation: 'write' | 'delete'
  path: string
  content?: string
}

export interface ParseResult {
  operations: FileOperation[]
  errors: string[]
}

/**
 * Tries every strategy in order until one yields operations.
 * 1. Delimiter format  <<<FILE:path>>> … <<<END_FILE>>>
 * 2. JSON (direct parse after fence stripping)
 * 3. JSON (greedy bracket extraction with repair)
 * 4. JSON (line-by-line repair of unescaped strings)
 */
export function parseLLMResponse(raw: string): ParseResult {
  const errors: string[] = []

  // ── Strategy 1: delimiter format ─────────────────────────────────────────
  const delimResult = parseDelimiterFormat(raw)
  if (delimResult.operations.length > 0) return delimResult

  // ── Strategy 2: JSON — strip fences + direct parse ───────────────────────
  const cleaned = stripFences(raw)

  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) {
      const ops = extractOps(parsed, errors)
      if (ops.length > 0) return { operations: ops, errors }
    }
  } catch {
    /* fall through */
  }

  // ── Strategy 3: bracket extraction ───────────────────────────────────────
  // Find the outermost [ … ] in the response
  const bracketStart = cleaned.indexOf('[')
  const bracketEnd = cleaned.lastIndexOf(']')
  if (bracketStart !== -1 && bracketEnd > bracketStart) {
    const slice = cleaned.slice(bracketStart, bracketEnd + 1)
    try {
      const parsed = JSON.parse(slice)
      if (Array.isArray(parsed)) {
        const ops = extractOps(parsed, errors)
        if (ops.length > 0) return { operations: ops, errors }
      }
    } catch {
      /* fall through */
    }

    // ── Strategy 4: repair unescaped content strings ─────────────────────
    const repaired = repairJsonStrings(slice)
    try {
      const parsed = JSON.parse(repaired)
      if (Array.isArray(parsed)) {
        const ops = extractOps(parsed, errors)
        if (ops.length > 0) return { operations: ops, errors }
      }
    } catch {
      /* fall through */
    }
  }

  // ── Strategy 5: object-by-object regex extraction ────────────────────────
  const regexOps = extractViaRegex(cleaned, errors)
  if (regexOps.length > 0) return { operations: regexOps, errors }

  errors.push('Could not parse any file operations from the LLM response')
  return { operations: [], errors }
}

// ─── Delimiter format parser ──────────────────────────────────────────────────
// Supports:
//   <<<FILE:path/to/file.ext>>>
//   ...raw content...
//   <<<END_FILE>>>
//   <<<DELETE:path/to/file.ext>>>

function parseDelimiterFormat(raw: string): ParseResult {
  const operations: FileOperation[] = []
  const errors: string[] = []

  // Write operations
  const writeRe = /<<<FILE:([^\n>]+)>>>([\s\S]*?)<<<END_FILE>>>/g
  let m: RegExpExecArray | null
  while ((m = writeRe.exec(raw)) !== null) {
    const path = sanitizePath(m[1]!.trim())
    if (!path) {
      errors.push('Empty path in FILE block')
      continue
    }
    const content = m[2]!.replace(/^\n/, '') // strip leading newline only
    operations.push({ operation: 'write', path, content })
  }

  // Delete operations
  const deleteRe = /<<<DELETE:([^\n>]+)>>>/g
  while ((m = deleteRe.exec(raw)) !== null) {
    const path = sanitizePath(m[1]!.trim())
    if (path) operations.push({ operation: 'delete', path })
  }

  return { operations, errors }
}

// ─── JSON helpers ─────────────────────────────────────────────────────────────

function stripFences(raw: string): string {
  let s = raw.trim()
  // Remove opening fence: ```json or ``` or ```typescript etc.
  s = s.replace(/^```[\w]*\s*\n?/, '')
  // Remove closing fence (may have trailing whitespace/newlines)
  s = s.replace(/\n?```\s*$/, '')
  return s.trim()
}

function extractOps(arr: unknown[], errors: string[]): FileOperation[] {
  const ops: FileOperation[] = []
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue
    const op = item as Record<string, unknown>
    if (op.operation !== 'write' && op.operation !== 'delete') continue
    if (typeof op.path !== 'string' || !op.path.trim()) continue
    const path = sanitizePath(op.path)
    if (!path) continue
    if (op.operation === 'write') {
      if (typeof op.content !== 'string') {
        errors.push(`Missing content for: ${path}`)
        continue
      }
      ops.push({ operation: 'write', path, content: op.content })
    } else {
      ops.push({ operation: 'delete', path })
    }
  }
  return ops
}

/**
 * Attempts to fix the most common LLM JSON bug: literal (unescaped)
 * newlines inside string values. Works by scanning char-by-char and
 * escaping bare newlines that appear inside a JSON string context.
 */
function repairJsonStrings(raw: string): string {
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!

    if (escaped) {
      result += ch
      escaped = false
      continue
    }

    if (ch === '\\' && inString) {
      result += ch
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      result += ch
      continue
    }

    if (inString) {
      // Escape control characters that are illegal inside JSON strings
      if (ch === '\n') {
        result += '\\n'
        continue
      }
      if (ch === '\r') {
        result += '\\r'
        continue
      }
      if (ch === '\t') {
        result += '\\t'
        continue
      }
    }

    result += ch
  }

  return result
}

/**
 * Last-ditch: find operation objects with regex and pull path + content manually.
 * Handles responses where JSON is partially valid.
 */
function extractViaRegex(raw: string, errors: string[]): FileOperation[] {
  const ops: FileOperation[] = []

  // Match "path": "some/file.ext"
  const pathRe = /"path"\s*:\s*"([^"]+)"/g
  // const contentRe = /"content"\s*:\s*"([\s\S]*?)(?<!\\)"/g
  const opRe = /"operation"\s*:\s*"(write|delete)"/g

  const paths: string[] = []
  // const contents: string[] = []
  const operations: string[] = []

  let m: RegExpExecArray | null
  while ((m = pathRe.exec(raw)) !== null) paths.push(m[1]!)
  while ((m = opRe.exec(raw)) !== null) operations.push(m[1]!)

  // Content is trickier — use a simpler heuristic: split on known file markers
  // This only works if we have paths and operations
  if (paths.length === 0 || operations.length === 0) return ops

  // For each path, try to find content between its first occurrence and the next
  for (let i = 0; i < Math.min(paths.length, operations.length); i++) {
    const path = sanitizePath(paths[i]!)
    const operation = operations[i]!
    if (!path) continue

    if (operation === 'delete') {
      ops.push({ operation: 'delete', path })
      continue
    }

    // Try to extract content for this file
    const pathIdx = raw.indexOf(`"path": "${paths[i]!}"`)
    if (pathIdx === -1) continue

    const contentMatch = /"content"\s*:\s*"([\s\S]*?)"\s*[,}]/.exec(raw.slice(pathIdx))
    if (contentMatch) {
      // Unescape JSON string escapes
      const content = contentMatch[1]!
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
      ops.push({ operation: 'write', path, content })
    } else {
      errors.push(`Could not extract content for: ${path}`)
    }
  }

  return ops
}

function sanitizePath(p: string): string {
  return p
    .replace(/\.\.\//g, '')
    .replace(/^\/+/, '')
    .trim()
}
