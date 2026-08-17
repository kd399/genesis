<script setup lang="ts">
import { ref } from 'vue'
import { useProjectsStore } from '@/stores/projects'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import type { Project } from '@/types'

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{
  close: []
  created: [project: Project]
}>()

const projectsStore = useProjectsStore()
const name = ref('')
const description = ref('')
const loading = ref(false)
const error = ref('')

async function handleCreate() {
  if (!name.value.trim()) {
    error.value = 'Project name is required'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const project = await projectsStore.createProject({
      name: name.value.trim(),
      description: description.value.trim(),
      highLevelLocationId: props.locationId
    })
    emit('created', project)
  } catch {
    error.value = 'Failed to create project'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <!-- Backdrop -->
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/50" @click="emit('close')" />

    <!-- Dialog -->
    <div
      class="relative z-10 w-full max-w-md bg-background rounded-lg border shadow-lg p-6 space-y-4"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">New Project</h2>
        <button
          class="text-muted-foreground hover:text-foreground transition-colors"
          @click="emit('close')"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <form class="space-y-4" @submit.prevent="handleCreate">
        <div class="space-y-2">
          <Label for="proj-name">Project Name</Label>
          <Input
            id="proj-name"
            v-model="name"
            placeholder="Contact Dashboard"
            :disabled="loading"
          />
        </div>

        <div class="space-y-2">
          <Label for="proj-desc"
            >Description <span class="text-muted-foreground">(optional)</span></Label
          >
          <textarea
            id="proj-desc"
            v-model="description"
            placeholder="A dashboard showing recent contacts and upcoming appointments..."
            :disabled="loading"
            rows="3"
            class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          />
        </div>

        <div v-if="error" class="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {{ error }}
        </div>

        <div class="flex gap-2 justify-end">
          <Button type="button" variant="outline" @click="emit('close')">Cancel</Button>
          <Button type="submit" :loading="loading">Create Project</Button>
        </div>
      </form>
    </div>
  </div>
</template>
