<script setup lang="ts">
import { ref } from 'vue'
import { useProjectsStore } from '@/stores/projects'
import Dialog from '@/components/ui/Dialog.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Textarea from '@/components/ui/Textarea.vue'
import type { Project } from '@/types'

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
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
      highLevelLocationId: props.locationId,
    })
    emit('created', project)
  } catch {
    error.value = 'Failed to create project. Please try again.'
  } finally {
    loading.value = false
  }
}

function handleClose() {
  if (!loading.value) emit('update:open', false)
}
</script>

<template>
  <Dialog
    :open="true"
    title="New Project"
    description="Create a new AI-powered HighLevel app project."
    @update:open="handleClose"
  >
    <form class="space-y-4" @submit.prevent="handleCreate">
      <div class="space-y-2">
        <Label for="proj-name">Project Name</Label>
        <Input
          id="proj-name"
          v-model="name"
          placeholder="Contact Dashboard"
          :disabled="loading"
          autocomplete="off"
        />
      </div>

      <div class="space-y-2">
        <Label for="proj-desc">
          Description
          <span class="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Textarea
          id="proj-desc"
          v-model="description"
          placeholder="A dashboard showing recent contacts and upcoming appointments..."
          :disabled="loading"
          :rows="3"
        />
      </div>

      <div
        v-if="error"
        class="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2"
      >
        {{ error }}
      </div>
    </form>

    <template #footer>
      <Button type="button" variant="outline" :disabled="loading" @click="handleClose">
        Cancel
      </Button>
      <Button type="button" :loading="loading" @click="handleCreate">
        Create Project
      </Button>
    </template>
  </Dialog>
</template>
