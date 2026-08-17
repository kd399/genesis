import * as functions from 'firebase-functions'
import { auth } from '../admin'

export interface AuthenticatedRequest extends functions.https.Request {
  uid: string
}

export async function verifyAuth(req: functions.https.Request): Promise<string> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new functions.https.HttpsError('unauthenticated', 'Missing authorization header')
  }

  const token = authHeader.split('Bearer ')[1]
  try {
    const decoded = await auth.verifyIdToken(token!)
    return decoded.uid
  } catch {
    throw new functions.https.HttpsError('unauthenticated', 'Invalid or expired token')
  }
}
