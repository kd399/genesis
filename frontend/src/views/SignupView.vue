<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'

const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const localError = ref('')

async function handleSignup() {
  localError.value = ''
  if (!email.value || !password.value) return
  if (password.value !== confirmPassword.value) {
    localError.value = 'Passwords do not match'
    return
  }
  if (password.value.length < 6) {
    localError.value = 'Password must be at least 6 characters'
    return
  }

  loading.value = true
  try {
    await authStore.signup(email.value, password.value)
    router.push('/dashboard')
  } catch {
    // error shown from store
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background px-4">
    <div class="w-full max-w-sm space-y-6">
      <!-- Logo -->
      <div class="text-center space-y-2">
        <div class="inline-flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <svg
              class="w-5 h-5 text-primary-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <span class="text-xl font-bold tracking-tight">Genesis</span>
        </div>
        <p class="text-sm text-muted-foreground">Create your account</p>
      </div>

      <!-- Form -->
      <form class="space-y-4" @submit.prevent="handleSignup">
        <div class="space-y-2">
          <Label for="email">Email</Label>
          <Input
            id="email"
            v-model="email"
            type="email"
            placeholder="you@example.com"
            :disabled="loading"
            autocomplete="email"
          />
        </div>

        <div class="space-y-2">
          <Label for="password">Password</Label>
          <Input
            id="password"
            v-model="password"
            type="password"
            placeholder="••••••••"
            :disabled="loading"
            autocomplete="new-password"
          />
        </div>

        <div class="space-y-2">
          <Label for="confirm">Confirm Password</Label>
          <Input
            id="confirm"
            v-model="confirmPassword"
            type="password"
            placeholder="••••••••"
            :disabled="loading"
            autocomplete="new-password"
          />
        </div>

        <!-- Error -->
        <div
          v-if="localError || authStore.error"
          class="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2"
        >
          {{ localError || authStore.error }}
        </div>

        <Button type="submit" class="w-full" :loading="loading"> Create Account </Button>
      </form>

      <p class="text-center text-sm text-muted-foreground">
        Already have an account?
        <RouterLink to="/login" class="text-primary hover:underline font-medium"
          >Sign in</RouterLink
        >
      </p>
    </div>
  </div>
</template>
