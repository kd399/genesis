import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser
} from 'firebase/auth'
import { auth } from '@/services/firebase'
import type { User } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const firebaseUser = ref<FirebaseUser | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  const user = computed<User | null>(() => {
    if (!firebaseUser.value) return null
    return {
      uid: firebaseUser.value.uid,
      email: firebaseUser.value.email,
      displayName: firebaseUser.value.displayName
    }
  })

  const isAuthenticated = computed(() => !!firebaseUser.value)

  // Initialize auth state listener
  function init() {
    return new Promise<void>(resolve => {
      onAuthStateChanged(auth, fbUser => {
        firebaseUser.value = fbUser
        loading.value = false
        resolve()
      })
    })
  }

  async function signup(email: string, password: string) {
    error.value = null
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      firebaseUser.value = credential.user
    } catch (e: unknown) {
      error.value = getFirebaseErrorMessage(e)
      throw e
    }
  }

  async function login(email: string, password: string) {
    error.value = null
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      firebaseUser.value = credential.user
    } catch (e: unknown) {
      error.value = getFirebaseErrorMessage(e)
      throw e
    }
  }

  async function logout() {
    await signOut(auth)
    firebaseUser.value = null
  }

  function clearError() {
    error.value = null
  }

  return {
    user,
    firebaseUser,
    loading,
    error,
    isAuthenticated,
    init,
    signup,
    login,
    logout,
    clearError
  }
})

function getFirebaseErrorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'code' in e) {
    const code = (e as { code: string }).code
    const messages: Record<string, string> = {
      'auth/email-already-in-use': 'This email is already registered.',
      'auth/invalid-email': 'Invalid email address.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.'
    }
    return messages[code] ?? 'An error occurred. Please try again.'
  }
  return 'An error occurred. Please try again.'
}
