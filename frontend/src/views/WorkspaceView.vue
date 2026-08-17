<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/stores/auth'
import { useHighLevelStore } from '@/stores/highlevel'
import { useWorkspaceStore } from '@/stores/workspace'
import ChatPanel from '@/components/workspace/ChatPanel.vue'
import FileTree from '@/components/workspace/FileTree.vue'
import CodeEditor from '@/components/workspace/CodeEditor.vue'
import PreviewPanel from '@/components/workspace/PreviewPanel.vue'
import SnapshotDrawer from '@/components/workspace/SnapshotDrawer.vue'
import Badge from '@/components/ui/Badge.vue'
import type { Project } from '@/types'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const hlStore = useHighLevelStore()
const ws = useWorkspaceStore()

const project = ref<Project | null>(null)
const loading = ref(true)
const showSnapshots = ref(false)

// Panel widths (resizable feel via fixed percents for now)
const showChat = ref(true)
const showPreview = ref(true)

onMounted(async () => {
  const projectId = route.params.id as string

  try {
    const snap = await getDoc(doc(db, 'projects', projectId))
    if (!snap.exists() || snap.data().userId !== authStore.user?.uid) {
      router.push('/dashboard')
      return
    }
    project.value = { id: snap.id, ...snap.data() } as Project
    await hlStore.init()
    await ws.init(projectId)
  } catch {
    router.push('/dashboard')
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  ws.destroy()
  hlStore.destroy()
})
</script>

<template>
  <div class="h-screen flex flex-col bg-background overflow-hidden">
    <!-- Loading -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>

    <template v-else-if="project">
      <!-- Header -->
      <header class="h-11 border-b flex items-center px-3 gap-2 shrink-0">
        <RouterLink
          to="/dashboard"
          class="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </RouterLink>

        <div class="w-px h-4 bg-border shrink-0" />

        <!-- Project name -->
        <div class="flex items-center gap-1.5 min-w-0">
          <div class="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
            <svg class="w-3 h-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
          </div>
          <span class="font-medium text-sm truncate">{{ project.name }}</span>
        </div>

        <!-- Spacer -->
        <div class="flex-1" />

        <!-- HL Status -->
        <div v-if="hlStore.isConnected" class="hidden sm:flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
          <Badge variant="success" class="text-xs hidden md:flex">{{ hlStore.locationName }}</Badge>
        </div>

        <!-- Panel toggles -->
        <div class="flex items-center gap-1 ml-2">
          <button
            :class="[
              'p-1.5 rounded text-xs transition-colors',
              showChat ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
            ]"
            title="Toggle chat"
            @click="showChat = !showChat"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </button>

          <button
            :class="[
              'p-1.5 rounded text-xs transition-colors',
              showPreview
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            ]"
            title="Toggle preview"
            @click="showPreview = !showPreview"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </button>

          <button
            class="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Snapshot history"
            @click="showSnapshots = true"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        </div>
      </header>

      <!-- Main workspace — 3 panels -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Chat panel -->
        <div v-if="showChat" class="w-64 xl:w-72 border-r flex flex-col shrink-0 overflow-hidden">
          <ChatPanel />
        </div>

        <!-- Code panel = File tree + Editor -->
        <div class="flex-1 flex overflow-hidden min-w-0">
          <!-- File tree -->
          <div class="w-44 border-r shrink-0 overflow-hidden">
            <FileTree />
          </div>

          <!-- Monaco editor -->
          <div class="flex-1 overflow-hidden min-w-0">
            <CodeEditor />
          </div>
        </div>

        <!-- Preview panel -->
        <div
          v-if="showPreview"
          class="w-96 xl:w-[480px] border-l flex flex-col shrink-0 overflow-hidden"
        >
          <PreviewPanel />
        </div>
      </div>
    </template>
  </div>

  <!-- Snapshot drawer -->
  <SnapshotDrawer v-if="showSnapshots" @close="showSnapshots = false" />
</template>
