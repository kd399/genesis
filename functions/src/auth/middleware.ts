import * as functions from 'firebase-functions'
import { auth } from '../admin'

export interface AuthenticatedRequest extends functions.https.Request {
  uid: string
}

export async function verifyAuth(req: functions.https.Request): Promise<string> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header')
  }

  const token = authHeader.split('Bearer ')[1]
  try {
    const decoded = await auth.verifyIdToken(token!)
    return decoded.uid
  } catch {
    throw new Error('Invalid or expired token')
  }
}
