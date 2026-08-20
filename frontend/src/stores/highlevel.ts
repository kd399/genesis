import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { doc, getDoc, onSnapshot, DocumentSnapshot } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from './auth'
import type { HighLevelConnection } from '@/types'

export const useHighLevelStore = defineStore('highlevel', () => {
  const connection = ref<HighLevelConnection | null>(null)
  const loading = ref(false)
  console.log('loading = ref(false) ', loading.value)

  const isConnected = computed(() => !!connection.value)
  const locationName = computed(() => connection.value?.locationName ?? null)
  const locationId = computed(() => connection.value?.locationId ?? null)

  let unsubscribe: (() => void) | null = null

  async function init() {
    const authStore = useAuthStore()
    if (!authStore.user) return

    loading.value = true

    // Listen for connection changes in real-time
    const connectionRef = doc(db, 'highlevelConnections', authStore.user.uid)
    unsubscribe = onSnapshot(connectionRef, (snap: DocumentSnapshot) => {
      if (snap.exists()) {
        connection.value = { id: snap.id, ...snap.data() } as HighLevelConnection
      } else {
        connection.value = null
      }
      loading.value = false
    })
  }

  function destroy() {
    unsubscribe?.()
    connection.value = null
  }

  function getOAuthUrl(firebaseUid: string): string {
    // Per HL docs: use Install Link from App Auth pane → Advanced Settings
    // We pass state=firebaseUid so our CF callback links HL to the right Firebase user
    const installBaseUrl = import.meta.env.VITE_HIGHLEVEL_INSTALL_URL
    const appVersionId = import.meta.env.VITE_HIGHLEVEL_APP_VERSION_ID
    const redirectUri = import.meta.env.VITE_HIGHLEVEL_REDIRECT_URI

    if (installBaseUrl) {
      const url = new URL(installBaseUrl)
      url.searchParams.set('state', firebaseUid)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('version_id', appVersionId)
      return url.toString()
    }

    // Fallback: build manually
    const clientId = import.meta.env.VITE_HIGHLEVEL_CLIENT_ID
    const scopes = [
      'contacts.readonly',
      'contacts.write',
      'conversations.readonly',
      'conversations.write',
      'calendars.readonly',
      'calendars/events.readonly',
      'calendars/events.write',
      'locations.readonly'
    ].join(' ')

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      version_id: appVersionId,
      redirect_uri: redirectUri,
      scope: scopes,
      state: firebaseUid
    })

    return `https://marketplace.gohighlevel.com/oauth/chooselocation?${params.toString()}`
  }

  return {
    connection,
    loading,
    isConnected,
    locationName,
    locationId,
    init,
    destroy,
    getOAuthUrl
  }
})
