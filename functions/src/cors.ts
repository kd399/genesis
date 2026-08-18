import type { Response } from 'firebase-functions'

/**
 * Sets CORS headers on every response so browsers can call our functions
 * from any origin (including iframe srcdoc and localhost dev server).
 *
 * Call this at the very top of every onRequest handler — before any code
 * that could throw — so headers are always present even on error responses.
 *
 * Returns true if the request was an OPTIONS preflight (caller should
 * return immediately after).
 */
export function setCors(res: Response, req: { method: string }): boolean {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With')
  res.set('Access-Control-Max-Age', '86400') // cache preflight 24 h

  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return true
  }
  return false
}
