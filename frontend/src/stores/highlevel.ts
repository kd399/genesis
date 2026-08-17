import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { doc, getDoc, onSnapshot, DocumentSnapshot } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from './auth'
import type { HighLevelConnection } from '@/types'

export const useHighLevelStore = defineStore('highlevel', () => {
  const connection = ref<HighLevelConnection | null>(null)
  const loading = ref(false)
  console.log("loading = ref(false) ", loading.value);

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
    const clientId = import.meta.env.VITE_HIGHLEVEL_CLIENT_ID
    const redirectUri = import.meta.env.VITE_HIGHLEVEL_REDIRECT_URI
    const scopes = [
      'contacts.readonly',
      'contacts.write',
      'conversations.readonly',
      'conversations.write',
      'calendars.readonly',
      'calendars/events.readonly'
    ].join(' ')

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      state: firebaseUid // CF uses this to link HL connection to Firebase user
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
