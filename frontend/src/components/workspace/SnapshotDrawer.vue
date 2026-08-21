<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import Sheet from '@/components/ui/Sheet.vue'
import Button from '@/components/ui/Button.vue'
import Separator from '@/components/ui/Separator.vue'
import { formatDate } from '@/lib/utils'
import { RotateCcw, Clock } from 'lucide-vue-next'

interface Props {
  open: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const ws = useWorkspaceStore()
const restoringId = ref<string | null>(null)
const isLoading = ref(false)

onMounted(async () => {
  isLoading.value = true
  try {
    await ws.fetchSnapshots()
  } finally {
    isLoading.value = false
  }
})

async function handleRestore(snapshotId: string) {
  restoringId.value = snapshotId
  try {
    await ws.restoreSnapshot(snapshotId)
    emit('update:open', false)
  } finally {
    restoringId.value = null
  }
}
</script>

<template>
  <Sheet
    :open="open"
    side="right"
    title="Snapshot History"
    description="Each generation creates a restorable point-in-time snapshot of all project files."
    class="w-80 sm:max-w-80 p-0 flex flex-col"
    @update:open="emit('update:open', $event)"
  >
    <!-- header slot keeps default title/description, we just add padding -->
    <template #header>
      <div class="px-6 pt-6 pb-4">
        <div class="flex items-center gap-2 mb-1">
          <Clock class="w-4 h-4 text-primary" />
          <h2 class="text-lg font-semibold">Snapshot History</h2>
        </div>
        <p class="text-sm text-muted-foreground">
          Each generation creates a restorable snapshot.
        </p>
      </div>
      <Separator />
    </template>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto px-6 py-4 space-y-3">
      <!-- Loading -->
      <div v-if="isLoading" class="flex items-center justify-center py-12">
        <div class="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>

      <!-- Empty -->
      <div
        v-else-if="ws.snapshots.length === 0"
        class="flex flex-col items-center justify-center py-12 text-center"
      >
        <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
          <Clock class="w-5 h-5 text-muted-foreground" />
        </div>
        <p class="text-sm font-medium">No snapshots yet</p>
        <p class="text-xs text-muted-foreground mt-1">Generate an app to create your first snapshot</p>
      </div>

      <!-- Snapshot list -->
      <template v-else>
        <div
          v-for="(snap, i) in ws.snapshots"
          :key="snap.id"
          class="rounded-lg border bg-card p-3 space-y-3 hover:border-primary/40 transition-colors"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-sm font-medium">Generation #{{ ws.snapshots.length - i }}</p>
              <p class="text-xs text-muted-foreground mt-0.5">
                {{
                  snap.createdAt
                    ? formatDate(snap.createdAt.toDate ? snap.createdAt.toDate() : snap.createdAt)
                    : 'Just now'
                }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {{ (snap as any).filesCount ?? '?' }} files
            </span>
          </div>

          <Button
            size="sm"
            variant="outline"
            class="w-full h-8 text-xs gap-1.5"
            :loading="restoringId === snap.id"
            @click="handleRestore(snap.id)"
          >
            <RotateCcw v-if="restoringId !== snap.id" class="w-3 h-3" />
            Restore
          </Button>
        </div>
      </template>
    </div>
  </Sheet>
</template>
