import * as functions from 'firebase-functions'
import { verifyAuth } from '../auth/middleware'
import { db } from '../admin'
import { listContacts } from './contacts'
import { listConversations } from './conversations'
import { getAppointments, listCalendars } from './calendars'
import {
  getDummyContacts,
  getDummyConversations,
  getDummyAppointments,
  getDummyCalendars
} from './dummy'

/**
 * Proxy endpoint for generated apps.
 * When HighLevel is connected: fetches real CRM data.
 * When not connected: returns realistic dummy data so apps work without HL.
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
    const resource = req.query.resource as string

    if (!resource) {
      res.status(400).json({ error: 'resource query param is required' })
      return
    }

    // Check if HighLevel is connected for this user
    const connSnap = await db.collection('highlevelConnections').doc(uid).get()
    const isConnected = connSnap.exists && !!connSnap.data()?.accessToken

    // ── Not connected: return dummy data ────────────────────────────────────
    if (!isConnected) {
      switch (resource) {
        case 'contacts':
          res.json(getDummyContacts(req.query.query as string | undefined))
          break
        case 'conversations':
          res.json(getDummyConversations())
          break
        case 'appointments':
          res.json(getDummyAppointments())
          break
        case 'calendars':
          res.json(getDummyCalendars())
          break
        default:
          res.status(400).json({ error: `Unknown resource: ${resource}` })
      }
      return
    }

    // ── Connected: fetch real HighLevel data ─────────────────────────────────
    const { locationId } = connSnap.data()!

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
  } catch (err) {
    console.error('HighLevel proxy error:', err)
    res.status(500).json({ error: 'Failed to fetch data', message: String(err) })
  }
})
