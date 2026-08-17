export interface FileOperation {
  operation: 'write' | 'delete'
  path: string
  content?: string
}

export interface ParseResult {
  operations: FileOperation[]
  errors: string[]
}

export function parseLLMResponse(raw: string): ParseResult {
  const errors: string[] = []
  const operations: FileOperation[] = []

  // Strip markdown code fences if present
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim()
  }

  // Parse JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Try to extract JSON array from response
    const match = cleaned.match(/\[[\s\S]*\]/)
    if (match) {
      try {
        parsed = JSON.parse(match[0])
      } catch {
        errors.push('Failed to parse LLM response as JSON')
        return { operations, errors }
      }
    } else {
      errors.push('No JSON array found in LLM response')
      return { operations, errors }
    }
  }

  if (!Array.isArray(parsed)) {
    errors.push('LLM response is not a JSON array')
    return { operations, errors }
  }

  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) {
      errors.push(`Invalid operation item: ${JSON.stringify(item)}`)
      continue
    }

    const op = item as Record<string, unknown>

    // Validate operation type
    if (op.operation !== 'write' && op.operation !== 'delete') {
      errors.push(`Invalid operation type: ${op.operation}`)
      continue
    }

    // Validate path
    if (typeof op.path !== 'string' || !op.path.trim()) {
      errors.push(`Missing or invalid path in operation`)
      continue
    }

    // Sanitize path — prevent directory traversal
    const safePath = op.path
      .replace(/\.\.\//g, '')
      .replace(/^\/+/, '')
      .trim()

    if (!safePath) {
      errors.push(`Empty path after sanitization`)
      continue
    }

    if (op.operation === 'write') {
      if (typeof op.content !== 'string') {
        errors.push(`Missing content for write operation on: ${safePath}`)
        continue
      }
      operations.push({ operation: 'write', path: safePath, content: op.content })
    } else {
      operations.push({ operation: 'delete', path: safePath })
    }
  }

  return { operations, errors }
}
