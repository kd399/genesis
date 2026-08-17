import * as functions from 'firebase-functions'
import { verifyAuth } from '../auth/middleware'
import { db } from '../admin'
import { listContacts } from './contacts'
import { listConversations } from './conversations'
import { getAppointments, listCalendars } from './calendars'

/**
 * Proxy endpoint for generated apps.
 * Generated apps NEVER get direct HL tokens.
 * They call: GET /highlevelProxy?resource=contacts&locationId=xxx
 * This CF handles auth + token refresh + HL API call.
 */
export const highlevelProxy = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  try {
    const uid = await verifyAuth(req)

    // Get HL connection for this user
    const connSnap = await db.collection('highlevelConnections').doc(uid).get()
    if (!connSnap.exists) {
      res.status(400).json({ error: 'HighLevel not connected' })
      return
    }

    const { locationId } = connSnap.data()!
    const resource = req.query.resource as string

    switch (resource) {
      case 'contacts': {
        const data = await listContacts(uid, locationId as string, {
          limit: Number(req.query.limit ?? 20),
          query: req.query.query as string | undefined
        })
        res.json(data)
        break
      }

      case 'conversations': {
        const data = await listConversations(uid, locationId as string, {
          limit: Number(req.query.limit ?? 20)
        })
        res.json(data)
        break
      }

      case 'appointments': {
        const data = await getAppointments(uid, locationId as string, {
          startTime: req.query.startTime as string | undefined,
          endTime: req.query.endTime as string | undefined
        })
        res.json(data)
        break
      }

      case 'calendars': {
        const data = await listCalendars(uid, locationId as string)
        res.json(data)
        break
      }

      default:
        res.status(400).json({ error: `Unknown resource: ${resource}` })
    }
  } catch (err: unknown) {
    console.error('HighLevel proxy error:', err)
    res.status(500).json({ error: 'Failed to fetch HighLevel data' })
  }
})
