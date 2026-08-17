<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useHighLevelStore } from '@/stores/highlevel'
import { useProjectsStore } from '@/stores/projects'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import CreateProjectDialog from '@/components/dashboard/CreateProjectDialog.vue'
import { formatDate } from '@/lib/utils'

const router = useRouter()
const authStore = useAuthStore()
const hlStore = useHighLevelStore()
const projectsStore = useProjectsStore()

const showCreateDialog = ref(false)

onMounted(async () => {
  await hlStore.init()
  await projectsStore.fetchProjects()
})

onUnmounted(() => {
  hlStore.destroy()
})

function connectHighLevel() {
  if (!authStore.user) return
  window.location.href = hlStore.getOAuthUrl(authStore.user.uid)
}

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}

function openProject(id: string) {
  router.push(`/projects/${id}`)
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- Header -->
    <header class="border-b">
      <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <svg
              class="w-4 h-4 text-primary-foreground"
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
          <span class="font-semibold">Genesis</span>
        </div>

        <div class="flex items-center gap-3">
          <!-- HL Connection Status -->
          <div v-if="hlStore.isConnected" class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-green-500"></span>
            <span class="text-sm text-muted-foreground hidden sm:block">{{
              hlStore.locationName
            }}</span>
            <Badge variant="success" class="hidden sm:flex">Connected</Badge>
          </div>
          <div v-else class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-orange-400"></span>
            <span class="text-sm text-muted-foreground hidden sm:block">
              HighLevel not connected
            </span>
          </div>

          <span class="text-sm text-muted-foreground hidden md:block">{{
            authStore.user?.email
          }}</span>
          <Button variant="ghost" size="sm" @click="handleLogout">Logout</Button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-6xl mx-auto px-4 py-8">
      <!-- HL Connection Banner -->
      <div
        v-if="!hlStore.isConnected && !hlStore.loading"
        class="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-4 flex items-center justify-between"
      >
        <div>
          <p class="font-medium text-orange-800 text-sm">Connect your HighLevel account</p>
          <p class="text-orange-600 text-xs mt-0.5">
            Required to generate apps that use real HighLevel data
          </p>
        </div>
        <Button size="sm" @click="connectHighLevel">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M14.828 14.828a4 4 0 015.656 0l4-4a4 4 0 01-5.656-5.656l-1.1 1.1"
            />
          </svg>
          Connect HighLevel
        </Button>
      </div>

      <!-- Projects Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold">Projects</h1>
          <p class="text-sm text-muted-foreground mt-1">Build AI-powered HighLevel applications</p>
        </div>
        <Button @click="showCreateDialog = true" :disabled="hlStore.isConnected">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Project
        </Button>
      </div>

      <!-- Loading -->
      <div v-if="projectsStore.loading" class="text-center py-16 text-muted-foreground">
        Loading projects...
      </div>

      <!-- Empty State -->
      <div
        v-else-if="projectsStore.projects.length === 0"
        class="text-center py-16 border rounded-lg"
      >
        <div class="w-12 h-12 rounded-xl bg-muted mx-auto mb-4 flex items-center justify-center">
          <svg
            class="w-6 h-6 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        </div>
        <h3 class="font-medium text-sm">No projects yet</h3>
        <p class="text-xs text-muted-foreground mt-1 mb-4">
          {{
            hlStore.isConnected
              ? 'Create your first AI-powered app'
              : 'Connect HighLevel first to get started'
          }}
        </p>
        <Button size="sm" @click="showCreateDialog = true" :disabled="hlStore.isConnected">
          Create Project
        </Button>
      </div>

      <!-- Project Grid -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card
          v-for="project in projectsStore.projects"
          :key="project.id"
          class="p-4 cursor-pointer hover:border-primary/50 transition-colors group"
          @click="openProject(project.id)"
        >
          <div class="flex items-start justify-between mb-3">
            <div
              class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors"
            >
              <svg
                class="w-5 h-5 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <svg
              class="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>
          <h3 class="font-semibold text-sm mb-1">{{ project.name }}</h3>
          <p v-if="project.description" class="text-xs text-muted-foreground line-clamp-2 mb-3">
            {{ project.description }}
          </p>
          <p class="text-xs text-muted-foreground">
            {{ formatDate(project.createdAt) }}
          </p>
        </Card>
      </div>
    </main>
  </div>

  <!-- Create Project Dialog -->
  <CreateProjectDialog
    v-if="showCreateDialog"
    :location-id="hlStore.locationId ?? ''"
    @close="showCreateDialog = false"
    @created="
      p => {
        showCreateDialog = false
        openProject(p.id)
      }
    "
  />
</template>
