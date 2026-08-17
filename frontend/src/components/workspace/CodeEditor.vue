<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'

const ws = useWorkspaceStore()

// Track open tabs
const openTabs = ref<string[]>([])

watch(
  () => ws.activeFilePath,
  newPath => {
    if (newPath && !openTabs.value.includes(newPath)) {
      openTabs.value.push(newPath)
    }
  }
)

// During generation, show stream buffer
const editorContent = computed(() => {
  if (ws.generationState.isGenerating && ws.streamBuffer) {
    return ws.streamBuffer
  }
  return ws.activeFile?.content ?? ''
})

const editorLanguage = computed(() => {
  const path = ws.activeFilePath ?? ''
  const ext = path.split('.').pop()?.toLowerCase()
  const langMap: Record<string, string> = {
    html: 'html',
    js: 'javascript',
    ts: 'typescript',
    vue: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown'
  }
  return langMap[ext ?? ''] ?? 'plaintext'
})

const isReadOnly = computed(() => ws.generationState.isGenerating)

function closeTab(path: string, e: MouseEvent) {
  e.stopPropagation()
  openTabs.value = openTabs.value.filter(t => t !== path)
  if (ws.activeFilePath === path) {
    const remaining = openTabs.value
    ws.selectFile(remaining[remaining.length - 1] ?? ws.files[0]?.path ?? '')
  }
}

async function handleChange(value: string | undefined) {
  if (!value || !ws.activeFilePath || ws.generationState.isGenerating) return
  await ws.saveFile(ws.activeFilePath, value)
}

function getTabName(path: string) {
  return path.split('/').pop() ?? path
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Tabs bar -->
    <div
      class="flex items-center border-b bg-muted/30 overflow-x-auto shrink-0"
      style="height: 36px"
    >
      <div
        v-for="tab in openTabs"
        :key="tab"
        :class="[
          'flex items-center gap-1.5 px-3 h-full text-xs border-r cursor-pointer shrink-0 transition-colors',
          ws.activeFilePath === tab
            ? 'bg-background text-foreground font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
        ]"
        @click="ws.selectFile(tab)"
      >
        <span>{{ getTabName(tab) }}</span>
        <button
          class="opacity-0 hover:opacity-100 group-hover:opacity-60 ml-1 hover:text-destructive transition-opacity"
          :class="{ 'opacity-60': ws.activeFilePath === tab }"
          @click="closeTab(tab, $event)"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Generation indicator -->
      <div
        v-if="ws.generationState.isGenerating"
        class="ml-auto px-3 flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        Streaming...
      </div>
    </div>

    <!-- Editor area -->
    <div class="flex-1 relative overflow-hidden">
      <!-- Empty state -->
      <div
        v-if="!ws.activeFilePath && !ws.generationState.isGenerating"
        class="absolute inset-0 flex items-center justify-center text-muted-foreground"
      >
        <div class="text-center">
          <svg
            class="w-8 h-8 mx-auto mb-2 opacity-40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
          <p class="text-sm">No file selected</p>
        </div>
      </div>

      <!-- Stream buffer view during generation -->
      <div
        v-else-if="ws.generationState.isGenerating && ws.streamBuffer"
        class="absolute inset-0 overflow-auto bg-[#1e1e1e] p-4 font-mono text-xs text-green-400 whitespace-pre-wrap"
      >
        {{ ws.streamBuffer }}
      </div>

      <!-- Monaco Editor -->
      <vue-monaco-editor
        v-else-if="ws.activeFilePath"
        :value="editorContent"
        :language="editorLanguage"
        :read-only="isReadOnly"
        theme="vs-dark"
        :options="{
          fontSize: 13,
          lineNumbers: 'on',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 2,
          renderWhitespace: 'selection',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          padding: { top: 12 }
        }"
        style="height: 100%"
        @change="handleChange"
      />
    </div>
  </div>
</template>
