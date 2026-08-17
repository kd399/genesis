<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { getIdToken } from 'firebase/auth'
import { auth } from '@/services/firebase'
import { useWorkspaceStore } from '@/stores/workspace'

const ws = useWorkspaceStore()
const iframeEl = ref<HTMLIFrameElement | null>(null)
const isLoading = ref(false)
const previewError = ref<string | null>(null)

const FUNCTIONS_BASE = import.meta.env.DEV
  ? `http://localhost:5001/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/us-central1`
  : `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`

// Build srcdoc from project files
const srcdoc = computed(() => {
  const indexFile = ws.files.find(f => f.path === 'index.html')
  if (!indexFile) return null

  let html = indexFile.content

  // Inject other JS/CSS files inline
  ws.files.forEach(f => {
    if (f.path === 'index.html') return
    if (f.path.endsWith('.js')) {
      html = html
        .replace(`src="${f.path}"`, '')
        .replace(`<script src="${f.path}"></scr` + 'ipt>', `<script>${f.content}</scr` + 'ipt>')
        // Also try with ./ prefix
        .replace(`src="./${f.path}"`, '')
      // Append script at end if not replaced
      if (!html.includes(f.content)) {
        html = html.replace('</body>', `<script>${f.content}</scr` + `ipt>\n</body>`)
      }
    }
    if (f.path.endsWith('.css')) {
      html = html.replace(`<link rel="stylesheet" href="${f.path}">`, `<style>${f.content}</style>`)
    }
  })

  // Inject proxy base URL so generated app can find our backend
  html = html.replace(
    '</head>',
    `<script>
      window.__GENESIS_PROXY__ = '${FUNCTIONS_BASE}/highlevelProxy';
      window.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'auth-token') {
          window.__GENESIS_TOKEN__ = e.data.token;
        }
      });
    </scr` + `ipt>\n</head>`
  )

  return html
})

// Watch for generation completion — refresh preview
watch(
  () => ws.generationState.isGenerating,
  async isGenerating => {
    if (!isGenerating && ws.files.find(f => f.path === 'index.html')) {
      await refreshPreview()
    }
  }
)

// Watch srcdoc changes
watch(srcdoc, async doc => {
  if (doc && iframeEl.value) {
    isLoading.value = true
    iframeEl.value.srcdoc = doc
  }
})

async function refreshPreview() {
  if (!srcdoc.value || !iframeEl.value) return
  isLoading.value = true
  previewError.value = null
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
  injectToken()
}

function onIframeError() {
  isLoading.value = false
  previewError.value = 'Preview failed to load'
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-3 py-2 border-b flex items-center justify-between shrink-0">
      <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</span>
      <button
        v-if="srcdoc"
        class="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        @click="refreshPreview"
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        Refresh
      </button>
    </div>

    <!-- Preview area -->
    <div class="flex-1 relative overflow-hidden bg-white">
      <!-- Empty state -->
      <div
        v-if="!srcdoc && !ws.generationState.isGenerating"
        class="absolute inset-0 flex items-center justify-center bg-muted/10"
      >
        <div class="text-center text-muted-foreground">
          <div
            class="w-12 h-12 rounded-xl border-2 border-dashed border-border mx-auto mb-3 flex items-center justify-center"
          >
            <svg class="w-6 h-6 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p class="text-sm font-medium">No preview yet</p>
          <p class="text-xs mt-1 opacity-70">Generate an app to see the live preview</p>
        </div>
      </div>

      <!-- Generating overlay -->
      <div
        v-else-if="ws.generationState.isGenerating"
        class="absolute inset-0 flex items-center justify-center bg-muted/20 z-10"
      >
        <div class="text-center">
          <div
            class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-2"
          />
          <p class="text-xs text-muted-foreground">{{ ws.generationState.status }}</p>
        </div>
      </div>

      <!-- Loading overlay -->
      <div
        v-if="isLoading && srcdoc"
        class="absolute inset-0 flex items-center justify-center bg-background/80 z-10"
      >
        <div
          class="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin"
        />
      </div>

      <!-- Error state -->
      <div
        v-if="previewError"
        class="absolute bottom-3 left-3 right-3 bg-destructive/10 text-destructive text-xs rounded px-3 py-2 z-20"
      >
        {{ previewError }}
      </div>

      <!-- iframe -->
      <iframe
        v-if="srcdoc"
        ref="iframeEl"
        :srcdoc="srcdoc"
        sandbox="allow-scripts allow-same-origin allow-forms"
        class="w-full h-full border-0"
        @load="onIframeLoad"
        @error="onIframeError"
      />
    </div>
  </div>
</template>
