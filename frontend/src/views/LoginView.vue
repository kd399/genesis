<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!email.value || !password.value) return
  loading.value = true
  try {
    await authStore.login(email.value, password.value)
    const redirect = route.query.redirect as string | undefined
    router.push(redirect ?? '/dashboard')
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
        <p class="text-sm text-muted-foreground">Sign in to your account</p>
      </div>

      <!-- Form -->
      <form class="space-y-4" @submit.prevent="handleLogin">
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
            autocomplete="current-password"
          />
        </div>

        <!-- Error -->
        <div
          v-if="authStore.error"
          class="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2"
        >
          {{ authStore.error }}
        </div>

        <Button type="submit" class="w-full" :loading="loading"> Sign In </Button>
      </form>

      <p class="text-center text-sm text-muted-foreground">
        Don't have an account?
        <RouterLink to="/signup" class="text-primary hover:underline font-medium"
          >Sign up</RouterLink
        >
      </p>
    </div>
  </div>
</template>
