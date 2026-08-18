<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Message, ChatActivity } from '@/types'

const ws = useWorkspaceStore()
const prompt = ref('')
const chatEl = ref<HTMLElement | null>(null)

watch(
  () => ws.messages.length + JSON.stringify(ws.messages.map(m => m.activities?.length)),
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

function activityIcon(kind: ChatActivity['kind']): string {
  switch (kind) {
    case 'file_read':   return '📂'
    case 'file_write':  return '✏️'
    case 'file_delete': return '🗑️'
    case 'summary':     return '✅'
    default:            return '⚙️'
  }
}

function activityClass(kind: ChatActivity['kind']): string {
  switch (kind) {
    case 'file_write':  return 'text-blue-400'
    case 'file_read':   return 'text-yellow-400'
    case 'file_delete': return 'text-red-400'
    case 'summary':     return 'text-green-400 font-medium'
    default:            return 'text-muted-foreground'
  }
}

function formatTime(ts: any): string {
  if (!ts) return ''
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

const isGenerating = computed(() => ws.generationState.isGenerating)
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-3 py-2 border-b flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
          <svg class="w-3 h-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <span class="text-xs font-semibold">Genesis AI</span>
      </div>
    </div>

    <!-- Messages -->
    <div ref="chatEl" class="flex-1 overflow-y-auto p-3 space-y-4">

      <!-- Empty state -->
      <div
        v-if="ws.messages.length === 0 && !isGenerating"
        class="text-center py-12 text-muted-foreground"
      >
        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <svg class="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p class="text-sm font-medium mb-1">Describe what you want to build</p>
        <p class="text-xs opacity-60 max-w-[180px] mx-auto leading-relaxed">
          e.g. "Build a dashboard with my recent contacts and upcoming appointments"
        </p>
      </div>

      <!-- Message list -->
      <div
        v-for="msg in ws.messages"
        :key="msg.id"
        :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']"
      >
        <!-- User message -->
        <div v-if="msg.role === 'user'" class="max-w-[88%] space-y-1">
          <div class="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3 py-2 text-sm leading-relaxed">
            {{ msg.content }}
          </div>
          <div class="text-right text-[10px] text-muted-foreground pr-1">
            {{ formatTime(msg.createdAt) }}
          </div>
        </div>

        <!-- Assistant message -->
        <div v-else class="max-w-[92%] space-y-1.5">
          <!-- Avatar + name row -->
          <div class="flex items-center gap-1.5 pl-0.5">
            <div class="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
              <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <span class="text-[10px] font-medium text-muted-foreground">Genesis</span>
          </div>

          <!-- Activity steps (shown while generating and after) -->
          <div
            v-if="msg.activities && msg.activities.length > 0"
            class="bg-muted/50 border border-border/50 rounded-xl rounded-tl-sm px-3 py-2.5 space-y-1.5"
          >
            <div
              v-for="(activity, i) in msg.activities"
              :key="i"
              :class="['flex items-start gap-2 text-xs', activityClass(activity.kind)]"
            >
              <!-- Spinner on last activity if still generating -->
              <span v-if="i === msg.activities.length - 1 && isGenerating && msg.id === ws.messages[ws.messages.length - 1]?.id" class="shrink-0 mt-0.5">
                <svg class="w-3 h-3 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </span>
              <span v-else class="shrink-0">{{ activityIcon(activity.kind) }}</span>
              <span class="leading-relaxed break-all">
                {{ activity.label }}
                <span v-if="activity.path" class="ml-1 font-mono text-[10px] opacity-70">{{ activity.path }}</span>
              </span>
            </div>
          </div>

          <!-- Final summary text (if any and not covered by activities) -->
          <div
            v-if="msg.content && !msg.activities?.find(a => a.kind === 'summary')"
            class="bg-muted rounded-xl rounded-tl-sm px-3 py-2 text-sm leading-relaxed text-foreground"
          >
            {{ msg.content }}
          </div>

          <div class="text-[10px] text-muted-foreground pl-0.5">
            {{ formatTime(msg.createdAt) }}
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-if="ws.generationState.error" class="flex justify-start">
        <div class="bg-destructive/10 text-destructive rounded-xl px-3 py-2 text-xs max-w-[88%] flex items-start gap-2">
          <span class="shrink-0">⚠️</span>
          <span>{{ ws.generationState.error }}</span>
        </div>
      </div>
    </div>

    <!-- Input -->
    <div class="border-t p-3 space-y-2 shrink-0">
      <div class="relative">
        <textarea
          v-model="prompt"
          placeholder="Describe what you want to build..."
          rows="3"
          :disabled="isGenerating"
          class="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 pr-10 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 leading-relaxed"
          @keydown="handleKeydown"
        />
      </div>
      <div class="flex gap-2">
        <button
          v-if="!isGenerating"
          :disabled="!prompt.trim()"
          class="flex-1 flex items-center justify-center gap-2 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
          @click="handleSend"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Generate
        </button>
        <button
          v-else
          class="flex-1 flex items-center justify-center gap-2 h-8 px-3 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 transition-colors"
          @click="ws.abortGeneration()"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Stop
        </button>
      </div>
      <p class="text-[10px] text-muted-foreground text-center">Enter to send · Shift+Enter for newline</p>
    </div>
  </div>
</template>
