<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { getIdToken } from 'firebase/auth'
import { auth } from '@/services/firebase'
import { useWorkspaceStore } from '@/stores/workspace'

const ws = useWorkspaceStore()
const iframeEl = ref<HTMLIFrameElement | null>(null)
const isLoading = ref(false)
const previewError = ref<string | null>(null)
const previewReady = ref(false)

const FUNCTIONS_BASE = import.meta.env.DEV
  ? `http://localhost:5001/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/us-central1`
  : `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`

// Build a fully self-contained srcdoc from all project files
const srcdoc = computed((): string | null => {
  const indexFile = ws.files.find(f => f.path === 'index.html')
  if (!indexFile) return null

  let html = indexFile.content

  // Inline all JS files referenced in HTML
  ws.files.forEach(f => {
    if (f.path === 'index.html') return

    if (f.path.endsWith('.js')) {
      // Replace <script src="file.js"> and <script src="./file.js">
      const escaped = f.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re1 = new RegExp(`<script[^>]+src=["'](?:\\./)?(${escaped})["'][^>]*><\\/script>`, 'gi')
      const replacement = `<script>\n${f.content}\n<\/script>`
      const replaced = html.replace(re1, replacement)
      if (replaced === html) {
        // Not found as external ref — append before </body>
        html = html.replace(/<\/body>/i, `<script>\n${f.content}\n<\/script>\n</body>`)
      } else {
        html = replaced
      }
    }

    if (f.path.endsWith('.css')) {
      const escaped = f.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`<link[^>]+href=["'](?:\\./)?(${escaped})["'][^>]*>`, 'gi')
      html = html.replace(re, `<style>\n${f.content}\n</style>`)
    }
  })

  // Inject genesis bootstrap script (proxy URL + token bridge)
  const bootstrap = `
<script>
(function() {
  window.__GENESIS_PROXY__ = '${FUNCTIONS_BASE}/highlevelProxy';
  // Listen for auth token from parent
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'auth-token') {
      window.__GENESIS_TOKEN__ = e.data.token;
      // Dispatch a custom event so app code can react
      window.dispatchEvent(new CustomEvent('genesis-ready', { detail: { token: e.data.token } }));
    }
  });
})();
<\/script>`

  // Insert before </head> or at start if no head
  if (html.includes('</head>')) {
    html = html.replace('</head>', bootstrap + '\n</head>')
  } else {
    html = bootstrap + '\n' + html
  }

  return html
})

const hasPreview = computed(() => !!srcdoc.value)

// Refresh preview when generation finishes
watch(
  () => ws.generationState.isGenerating,
  async (isGenerating, wasGenerating) => {
    if (wasGenerating && !isGenerating && srcdoc.value) {
      await refreshPreview()
    }
  }
)

// Also refresh when files change externally (restore snapshot, manual save)
watch(
  () => ws.files.map(f => f.path + f.updatedAt).join('|'),
  async () => {
    if (!ws.generationState.isGenerating && srcdoc.value && previewReady.value) {
      await refreshPreview()
    }
  }
)

async function refreshPreview() {
  if (!srcdoc.value || !iframeEl.value) return
  isLoading.value = true
  previewError.value = null
  previewReady.value = false
  iframeEl.value.srcdoc = srcdoc.value
}

async function injectToken() {
  if (!iframeEl.value?.contentWindow || !auth.currentUser) return
  try {
    const token = await getIdToken(auth.currentUser)
    iframeEl.value.contentWindow.postMessage({ type: 'auth-token', token }, '*')
  } catch {
    // non-fatal
  }
}

function onIframeLoad() {
  isLoading.value = false
  previewReady.value = true
  // Inject token shortly after load so the app's message listener is ready
  setTimeout(() => injectToken(), 100)
}

function onIframeError() {
  isLoading.value = false
  previewError.value = 'Preview failed to load'
}

async function openInNewTab() {
  if (!srcdoc.value) return
  const blob = new Blob([srcdoc.value], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-3 py-2 border-b flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 rounded bg-green-500/10 flex items-center justify-center">
          <svg class="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <span class="text-xs font-semibold">Preview</span>
        <!-- Live indicator -->
        <div v-if="hasPreview && !ws.generationState.isGenerating" class="flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span class="text-[10px] text-muted-foreground">Live</span>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-if="hasPreview"
          class="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Open in new tab"
          @click="openInNewTab"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
        <button
          v-if="hasPreview"
          class="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Refresh preview"
          @click="refreshPreview"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Preview area -->
    <div class="flex-1 relative overflow-hidden bg-white">

      <!-- Empty state -->
      <div
        v-if="!hasPreview && !ws.generationState.isGenerating"
        class="absolute inset-0 flex items-center justify-center bg-muted/10"
      >
        <div class="text-center text-muted-foreground">
          <div class="w-16 h-16 rounded-2xl border-2 border-dashed border-border mx-auto mb-4 flex items-center justify-center">
            <svg class="w-7 h-7 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p class="text-sm font-medium">No preview yet</p>
          <p class="text-xs mt-1 opacity-60">Describe what to build in the chat</p>
        </div>
      </div>

      <!-- Generating overlay -->
      <div
        v-if="ws.generationState.isGenerating"
        class="absolute inset-0 flex items-center justify-center bg-background/90 z-10"
      >
        <div class="text-center space-y-3">
          <div class="relative w-12 h-12 mx-auto">
            <svg class="w-12 h-12 animate-spin text-primary/20" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            </svg>
            <svg class="absolute inset-0 w-12 h-12 animate-spin text-primary" fill="none" viewBox="0 0 24 24" style="animation-duration:0.8s">
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
          <div>
            <p class="text-sm font-medium">Generating your app…</p>
            <p class="text-xs text-muted-foreground mt-1">{{ ws.generationState.status }}</p>
          </div>
        </div>
      </div>

      <!-- Loading overlay (iframe loading) -->
      <div
        v-if="isLoading && hasPreview && !ws.generationState.isGenerating"
        class="absolute inset-0 flex items-center justify-center bg-background/60 z-10"
      >
        <div class="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>

      <!-- Error -->
      <div
        v-if="previewError"
        class="absolute bottom-3 left-3 right-3 bg-destructive/10 text-destructive text-xs rounded-lg px-3 py-2 z-20 flex items-center gap-2"
      >
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {{ previewError }}
      </div>

      <!-- iframe -->
      <iframe
        v-if="hasPreview"
        ref="iframeEl"
        :srcdoc="srcdoc!"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        class="w-full h-full border-0"
        @load="onIframeLoad"
        @error="onIframeError"
      />
    </div>
  </div>
</template>
