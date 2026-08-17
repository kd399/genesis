<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import Button from '@/components/ui/Button.vue'

const ws = useWorkspaceStore()
const prompt = ref('')
const chatEl = ref<HTMLElement | null>(null)

watch(
  () => ws.messages.length,
  async () => {
    await nextTick()
    chatEl.value?.scrollTo({ top: chatEl.value.scrollHeight, behavior: 'smooth' })
  }
)

async function handleSend() {
  const text = prompt.value.trim()
  if (!text || ws.generationState.isGenerating) return
  prompt.value = ''
  await ws.generate(text)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-3 py-2 border-b flex items-center justify-between">
      <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Chat</span>
    </div>

    <!-- Messages -->
    <div ref="chatEl" class="flex-1 overflow-y-auto p-3 space-y-3">
      <!-- Empty state -->
      <div
        v-if="ws.messages.length === 0 && !ws.generationState.isGenerating"
        class="text-center py-8 text-muted-foreground"
      >
        <div
          class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3"
        >
          <svg class="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <p class="text-xs font-medium">Describe what you want to build</p>
        <p class="text-xs mt-1 opacity-70">
          e.g. "Build a dashboard with recent contacts and upcoming appointments"
        </p>
      </div>

      <!-- Message list -->
      <div
        v-for="msg in ws.messages"
        :key="msg.id"
        :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']"
      >
        <div
          :class="[
            'max-w-[85%] rounded-lg px-3 py-2 text-sm',
            msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
          ]"
        >
          {{ msg.content }}
        </div>
      </div>

      <!-- Generating status -->
      <div v-if="ws.generationState.isGenerating" class="flex justify-start">
        <div class="bg-muted rounded-lg px-3 py-2 text-sm max-w-[85%]">
          <div class="flex items-center gap-2 text-muted-foreground">
            <div class="flex gap-1">
              <span
                class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                style="animation-delay: 0ms"
              />
              <span
                class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                style="animation-delay: 150ms"
              />
              <span
                class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                style="animation-delay: 300ms"
              />
            </div>
            <span class="text-xs">{{ ws.generationState.status || 'Generating...' }}</span>
          </div>
          <div v-if="ws.generationState.currentFile" class="text-xs mt-1 text-primary font-mono">
            ✏️ {{ ws.generationState.currentFile }}
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-if="ws.generationState.error" class="flex justify-start">
        <div class="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-xs max-w-[85%]">
          ⚠️ {{ ws.generationState.error }}
        </div>
      </div>
    </div>

    <!-- Input -->
    <div class="border-t p-3 space-y-2">
      <textarea
        v-model="prompt"
        placeholder="Describe what you want to build..."
        rows="3"
        :disabled="ws.generationState.isGenerating"
        class="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        @keydown="handleKeydown"
      />
      <div class="flex gap-2">
        <Button
          v-if="!ws.generationState.isGenerating"
          class="flex-1"
          :disabled="!prompt.trim()"
          @click="handleSend"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Generate
        </Button>
        <Button v-else variant="destructive" class="flex-1" @click="ws.abortGeneration()">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          Stop
        </Button>
      </div>
    </div>
  </div>
</template>
