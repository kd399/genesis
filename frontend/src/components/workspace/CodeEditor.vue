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

// During generation, new files appear in file tree — auto-open them as tabs
watch(
  () => ws.files.map(f => f.path),
  paths => {
    // Add new file paths that appeared during generation
    paths.forEach(p => {
      if (!openTabs.value.includes(p)) {
        openTabs.value.push(p)
      }
    })
  }
)

const isGenerating = computed(() => ws.generationState.isGenerating)

// Use the store's computed editor content (handles streaming)
const editorContent = computed(() => ws.editorContent)

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

// Read-only while streaming
const isReadOnly = computed(() => isGenerating.value)

function closeTab(path: string, e: MouseEvent) {
  e.stopPropagation()
  openTabs.value = openTabs.value.filter(t => t !== path)
  if (ws.activeFilePath === path) {
    const remaining = openTabs.value
    ws.selectFile(remaining[remaining.length - 1] ?? ws.files[0]?.path ?? '')
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null
async function handleChange(value: string | undefined) {
  if (!value || !ws.activeFilePath || isGenerating.value) return
  // Debounce saves by 800ms
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    ws.saveFile(ws.activeFilePath!, value)
  }, 800)
}

function getTabName(path: string) {
  return path.split('/').pop() ?? path
}

function getTabIcon(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'html': return '🌐'
    case 'js':   return '⚡'
    case 'css':  return '🎨'
    case 'json': return '📋'
    case 'ts':   return '🔷'
    default:     return '📄'
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Tabs bar -->
    <div
      class="flex items-center border-b bg-muted/30 overflow-x-auto shrink-0 scrollbar-thin"
      style="height: 36px"
    >
      <div
        v-for="tab in openTabs"
        :key="tab"
        :class="[
          'group flex items-center gap-1.5 px-3 h-full text-xs border-r cursor-pointer shrink-0 transition-colors',
          ws.activeFilePath === tab
            ? 'bg-background text-foreground font-medium border-t-2 border-t-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
        ]"
        @click="ws.selectFile(tab)"
      >
        <span class="text-[10px]">{{ getTabIcon(tab) }}</span>
        <span class="max-w-[100px] truncate">{{ getTabName(tab) }}</span>
        <!-- Streaming indicator on active streaming file -->
        <span
          v-if="isGenerating && ws.activeStreamFile === tab"
          class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0"
        />
        <button
          v-else
          class="opacity-0 group-hover:opacity-60 ml-0.5 hover:opacity-100 hover:text-destructive transition-opacity shrink-0"
          :class="{ 'opacity-60': ws.activeFilePath === tab }"
          @click="closeTab(tab, $event)"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Generation streaming indicator -->
      <div
        v-if="isGenerating"
        class="ml-auto px-3 flex items-center gap-1.5 text-xs text-muted-foreground shrink-0"
      >
        <svg class="w-3 h-3 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <span>
          {{ ws.generationState.currentFile
              ? `Writing ${ws.generationState.currentFile}…`
              : ws.generationState.status || 'Generating…' }}
        </span>
      </div>
    </div>

    <!-- Editor area -->
    <div class="flex-1 relative overflow-hidden">
      <!-- Empty state -->
      <div
        v-if="!ws.activeFilePath && !isGenerating"
        class="absolute inset-0 flex items-center justify-center text-muted-foreground"
      >
        <div class="text-center">
          <svg class="w-10 h-10 mx-auto mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <p class="text-sm">No file selected</p>
          <p class="text-xs mt-1 opacity-60">Click a file in the tree or generate an app</p>
        </div>
      </div>

      <!-- Waiting for first token during generation -->
      <div
        v-else-if="isGenerating && !ws.activeFilePath"
        class="absolute inset-0 flex items-center justify-center bg-[#1e1e1e]"
      >
        <div class="text-center text-muted-foreground">
          <svg class="w-8 h-8 animate-spin text-primary mx-auto mb-3" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p class="text-xs">{{ ws.generationState.status }}</p>
        </div>
      </div>

      <!-- Monaco Editor — shows streamed content in real-time via editorContent computed -->
      <vue-monaco-editor
        v-else-if="ws.activeFilePath"
        :key="ws.activeFilePath"
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
          padding: { top: 12 },
          scrollbar: { alwaysConsumeMouseWheel: false }
        }"
        style="height: 100%"
        @change="handleChange"
      />
    </div>
  </div>
</template>
