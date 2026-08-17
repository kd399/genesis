<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const status = ref<'processing' | 'success' | 'error'>('processing')
const message = ref('Processing HighLevel connection...')

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error')

  if (error) {
    status.value = 'error'
    message.value = `Authorization denied: ${error}`
    setTimeout(() => router.push('/dashboard'), 3000)
    return
  }

  if (!code) {
    status.value = 'error'
    message.value = 'No authorization code received'
    setTimeout(() => router.push('/dashboard'), 3000)
    return
  }

  // The Cloud Function handles the actual exchange
  // This page is just a visual confirmation that the redirect happened
  // Firebase Cloud Function callback URL is the actual OAuth redirect URI
  // If user lands here (not the CF), show success and redirect
  status.value = 'success'
  message.value = 'HighLevel connected successfully!'
  setTimeout(() => router.push('/dashboard'), 2000)
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background">
    <div class="text-center space-y-4">
      <div v-if="status === 'processing'" class="space-y-3">
        <div
          class="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto"
        />
        <p class="text-sm text-muted-foreground">{{ message }}</p>
      </div>

      <div v-else-if="status === 'success'" class="space-y-3">
        <div class="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <svg class="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <p class="font-medium">{{ message }}</p>
        <p class="text-sm text-muted-foreground">Redirecting to dashboard...</p>
      </div>

      <div v-else class="space-y-3">
        <div
          class="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto"
        >
          <svg
            class="w-6 h-6 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <p class="font-medium text-destructive">{{ message }}</p>
        <p class="text-sm text-muted-foreground">Redirecting to dashboard...</p>
      </div>
    </div>
  </div>
</template>
