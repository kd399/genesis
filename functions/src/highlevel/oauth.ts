import * as functions from 'firebase-functions'
import axios from 'axios'
import { db } from '../admin'
import { FieldValue } from 'firebase-admin/firestore'

const HL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token'
const HL_LOCATION_URL = 'https://services.leadconnectorhq.com/locations'

interface HLTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
  locationId: string
  companyId: string
  userId: string
}

// OAuth callback — HighLevel redirects here after user authorizes
export const highlevelOAuthCallback = functions.https.onRequest(async (req, res) => {
  console.log('HighLevel OAuth callback triggered')
  res.set('Access-Control-Allow-Origin', '*')

  const { code, state, error } = req.query
  console.log('HighLevel OAuth callback received:', { code, state, error })

  if (error) {
    res.redirect(
      `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/oauth/callback?error=${error}`
    )
    return
  }

  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Missing authorization code' })
    return
  }

  // state contains the Firebase uid
  const firebaseUid = state as string
  if (!firebaseUid) {
    res.status(400).json({ error: 'Missing state (Firebase UID)' })
    return
  }

  try {
    // Exchange code for tokens
    const tokenRes = await axios.post<HLTokenResponse>(
      HL_TOKEN_URL,
      new URLSearchParams({
        client_id: process.env.HIGHLEVEL_CLIENT_ID ?? '',
        client_secret: process.env.HIGHLEVEL_CLIENT_SECRET ?? '',
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.HIGHLEVEL_REDIRECT_URI ?? ''
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )

    const { access_token, refresh_token, expires_in, locationId } = tokenRes.data
    console.log('HighLevel token exchange successful:', { access_token, refresh_token, expires_in, locationId })

    // Fetch location name
    let locationName = locationId
    try {
      const locRes = await axios.get(`${HL_LOCATION_URL}/${locationId}`, {
        headers: { Authorization: `Bearer ${access_token}`, Version: '2021-07-28' }
      })
      locationName = locRes.data?.location?.name ?? locationId
    } catch {
      // Non-fatal — use locationId as fallback
    }

    // Store connection in Firestore (scoped to Firebase user)
    const expiresAt = new Date(Date.now() + expires_in * 1000)
    await db.collection('highlevelConnections').doc(firebaseUid).set({
      userId: firebaseUid,
      locationId,
      locationName,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    })

    // Redirect back to frontend
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
    res.redirect(`${frontendUrl}/dashboard?hl_connected=true`)
  } catch (err) {
    console.error('HighLevel OAuth error:', err)
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
    res.redirect(`${frontendUrl}/dashboard?hl_error=token_exchange_failed`)
  }
})

// Refresh expired HL access token
export async function refreshHighLevelToken(userId: string): Promise<string> {
  const connRef = db.collection('highlevelConnections').doc(userId)
  const connSnap = await connRef.get()

  if (!connSnap.exists) {
    throw new Error('No HighLevel connection found')
  }

  const conn = connSnap.data()!

  // Check if still valid (5 min buffer)
  const expiresAt = conn.expiresAt.toDate ? conn.expiresAt.toDate() : new Date(conn.expiresAt)
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return conn.accessToken as string
  }

  // Refresh
  const tokenRes = await axios.post<HLTokenResponse>(
    HL_TOKEN_URL,
    new URLSearchParams({
      client_id: process.env.HIGHLEVEL_CLIENT_ID ?? '',
      client_secret: process.env.HIGHLEVEL_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: conn.refreshToken as string
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  const { access_token, refresh_token, expires_in } = tokenRes.data
  const expiresAtNew = new Date(Date.now() + expires_in * 1000)

  await connRef.update({
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: expiresAtNew,
    updatedAt: FieldValue.serverTimestamp()
  })

  return access_token
}
