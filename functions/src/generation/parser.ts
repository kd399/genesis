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

  // ── Strategy 6: markdown code block extraction ────────────────────────────
  // Handles the case where LLM ignores JSON/delimiter instructions and wraps
  // content in markdown fences like ```html ... ``` or ```js ... ```
  // We extract each fenced block and assign a filename based on the language tag.
  const markdownOps = extractFromMarkdownBlocks(raw, errors)
  if (markdownOps.length > 0) return { operations: markdownOps, errors }

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

  // Match both <<< and << variants (LLM sometimes outputs only 2 angle brackets)
  // Also match END_FILE with 2 or 3 closing brackets
  // Pattern: <<<FILE:path>>> or <<FILE:path>> or <<<FILE:path>>
  const writeRe = /<<<?FILE:([^\n>]+?)>?>?>>([\s\S]*?)<<<?END_FILE>?>?>/g
  let m: RegExpExecArray | null
  while ((m = writeRe.exec(raw)) !== null) {
    const path = sanitizePath(m[1]!.trim())
    if (!path) {
      errors.push('Empty path in FILE block')
      continue
    }
    const content = m[2]!.replace(/^\n/, '')
    operations.push({ operation: 'write', path, content })
  }

  // Delete operations — also flexible with bracket count
  const deleteRe = /<<<?DELETE:([^\n>]+?)>?>?>/g
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

/**
 * Strategy 6: Extract content from markdown fenced code blocks.
 * LLM sometimes ignores JSON instructions and returns:
 *   ```html
 *   <!DOCTYPE html>...
 *   ```
 * We map language tags → filenames and treat each block as a write operation.
 */
function extractFromMarkdownBlocks(raw: string, errors: string[]): FileOperation[] {
  const ops: FileOperation[] = []

  // Match all ``` fenced blocks, with optional language tag
  // e.g. ```html, ```javascript, ```js, ```css, ```
  const fenceRe = /```(\w*)\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  const langCount: Record<string, number> = {}

  while ((m = fenceRe.exec(raw)) !== null) {
    const lang = (m[1] ?? '').toLowerCase().trim()
    const content = m[2] ?? ''

    if (!content.trim()) continue

    // Map language tag → filename
    // If same language appears multiple times, suffix with index
    const langKey = lang || 'html'
    langCount[langKey] = (langCount[langKey] ?? 0) + 1
    const idx = langCount[langKey]!

    let filename: string
    if (lang === 'html' || lang === '' || lang === 'htm') {
      filename = idx === 1 ? 'index.html' : `page${idx}.html`
    } else if (lang === 'javascript' || lang === 'js') {
      filename = idx === 1 ? 'app.js' : `script${idx}.js`
    } else if (lang === 'css') {
      filename = idx === 1 ? 'style.css' : `style${idx}.css`
    } else if (lang === 'typescript' || lang === 'ts') {
      filename = idx === 1 ? 'app.ts' : `module${idx}.ts`
    } else if (lang === 'json') {
      filename = idx === 1 ? 'data.json' : `data${idx}.json`
    } else {
      // Unknown language — skip tiny snippets, treat larger ones as index.html
      if (content.trim().length < 100) continue
      filename = idx === 1 ? 'index.html' : `file${idx}.html`
    }

    ops.push({ operation: 'write', path: filename, content: content.trimEnd() })
  }

  if (ops.length > 0) {
    errors.push(
      `Warning: LLM used markdown blocks instead of JSON. Extracted ${ops.length} file(s).`
    )
  }

  return ops
}

function sanitizePath(p: string): string {
  const cleaned = p
    .replace(/\.\.\//g, '')
    .replace(/^\/+/, '')
    .trim()

  // Reject anything that doesn't look like a real file path.
  // This catches the case where LLM puts HTML content in the "path" field
  // (happens when delimiter + JSON formats are mixed in the same response).
  if (cleaned.length > 200) return '' // too long to be a path
  if (cleaned.includes('<')) return '' // contains HTML tags
  if (cleaned.includes('\n')) return '' // contains newlines
  if (!/\.[a-z]{1,10}$/i.test(cleaned)) return '' // no file extension

  return cleaned
}
