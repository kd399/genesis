import * as functions from 'firebase-functions'
import axios from 'axios'
import { db } from '../admin'
import { FieldValue } from 'firebase-admin/firestore'

const HL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token'

interface HLTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
  locationId: string
  companyId: string
  userId: string
  userType: string
}

// OAuth callback — HighLevel redirects here after user authorizes
export const hlOAuthCallback = functions.https.onRequest(async (req, res) => {
  console.log('HighLevel OAuth callback triggered')
  res.set('Access-Control-Allow-Origin', '*')

  const { code, state, error } = req.query
  console.log('HighLevel OAuth callback received:', { code, state, error })

  if (error) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
    res.redirect(`${frontendUrl}/dashboard?hl_error=${error}`)
    return
  }

  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Missing authorization code' })
    return
  }

  // state = Firebase UID (passed from frontend in OAuth URL)
  const firebaseUid = state as string
  if (!firebaseUid) {
    res.status(400).json({ error: 'Missing state (Firebase UID)' })
    return
  }

  try {
    // Exchange code for tokens
    // HighLevel requires application/x-www-form-urlencoded (NOT JSON)
    // https://marketplace.gohighlevel.com/docs/ghl/oauth/get-access-token
    const redirectUri =
      process.env.HIGHLEVEL_REDIRECT_URI ??
      `http://127.0.0.1:5001/${process.env.GCLOUD_PROJECT ?? 'app-builder-77fdb'}/us-central1/hlOAuthCallback`

    const tokenRes = await axios.post<HLTokenResponse>(
      HL_TOKEN_URL,
      new URLSearchParams({
        client_id: process.env.HIGHLEVEL_CLIENT_ID ?? '',
        client_secret: process.env.HIGHLEVEL_CLIENT_SECRET ?? '',
        grant_type: 'authorization_code',
        code,
        user_type: 'Location',
        redirect_uri: redirectUri
      }).toString(),
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    const { access_token, refresh_token, expires_in, locationId, companyId } = tokenRes.data

    // Fetch location name using the access token
    let locationName = locationId
    try {
      const locRes = await axios.get(
        `https://services.leadconnectorhq.com/locations/${locationId}`,
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            Version: '2021-07-28'
          }
        }
      )
      locationName = locRes.data?.location?.name ?? locationId
    } catch {
      // Non-fatal — fallback to locationId
    }

    // Store tokens in Firestore scoped to Firebase user
    const expiresAt = new Date(Date.now() + expires_in * 1000)
    await db
      .collection('highlevelConnections')
      .doc(firebaseUid)
      .set({
        userId: firebaseUid,
        locationId,
        locationName,
        companyId: companyId ?? '',
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      })

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
    res.redirect(`${frontendUrl}/dashboard?hl_connected=true`)
  } catch (err) {
    console.error('HighLevel OAuth error:', err)
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
    res.redirect(`${frontendUrl}/dashboard?hl_error=token_exchange_failed`)
  }
})

// Refresh expired HL access token — called internally before every HL API call
export async function refreshHighLevelToken(userId: string): Promise<string> {
  const connRef = db.collection('highlevelConnections').doc(userId)
  const connSnap = await connRef.get()

  if (!connSnap.exists) {
    throw new Error('No HighLevel connection found for this user')
  }

  const conn = connSnap.data()!

  // Check if token is still valid (5 min buffer)
  const expiresAt = conn.expiresAt?.toDate ? conn.expiresAt.toDate() : new Date(conn.expiresAt)
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return conn.accessToken as string
  }

  // Token expired — use refresh token to get a new one
  // Per HL docs: refresh token is valid 1 year, becomes invalid after use (new one issued)
  const redirectUri =
    process.env.HIGHLEVEL_REDIRECT_URI ??
    `http://127.0.0.1:5001/${process.env.GCLOUD_PROJECT ?? 'app-builder-77fdb'}/us-central1/hlOAuthCallback`

  const tokenRes = await axios.post<HLTokenResponse>(
    HL_TOKEN_URL,
    new URLSearchParams({
      client_id: process.env.HIGHLEVEL_CLIENT_ID ?? '',
      client_secret: process.env.HIGHLEVEL_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: conn.refreshToken as string,
      user_type: 'Location',
      redirect_uri: redirectUri
    }).toString(),
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  )

  const { access_token, refresh_token: new_refresh_token, expires_in } = tokenRes.data
  const expiresAtNew = new Date(Date.now() + expires_in * 1000)

  // Save new tokens — old refresh token is now invalid
  await connRef.update({
    accessToken: access_token,
    refreshToken: new_refresh_token, // HL issues a NEW refresh token each time
    expiresAt: expiresAtNew,
    updatedAt: FieldValue.serverTimestamp()
  })

  return access_token
}
