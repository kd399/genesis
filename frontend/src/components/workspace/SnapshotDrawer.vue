<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import Button from '@/components/ui/Button.vue'
import { formatDate } from '@/lib/utils'

const emit = defineEmits<{ close: [] }>()
const ws = useWorkspaceStore()
const restoringId = ref<string | null>(null)
const isLoading = ref(false)

onMounted(async () => {
  // Always refetch when drawer opens so we show latest snapshots
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
  } finally {
    restoringId.value = null
    emit('close')
  }
}
</script>

<template>
  <!-- Backdrop -->
  <div class="fixed inset-0 z-50 flex">
    <div class="absolute inset-0 bg-black/40" @click="emit('close')" />

    <!-- Drawer from right -->
    <div class="relative ml-auto z-10 w-80 h-full bg-background border-l flex flex-col">
      <div class="flex items-center justify-between px-4 py-3 border-b">
        <h2 class="font-semibold text-sm">Snapshot History</h2>
        <button class="text-muted-foreground hover:text-foreground" @click="emit('close')">
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

      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <!-- Loading state -->
        <div v-if="isLoading" class="flex items-center justify-center py-10">
          <div class="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>

        <div v-else-if="ws.snapshots.length === 0" class="text-center py-8 text-muted-foreground">
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
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p class="text-xs">No snapshots yet</p>
          <p class="text-xs opacity-70 mt-1">Each generation creates a restorable snapshot</p>
        </div>

        <template v-else>
        <div
          v-for="(snap, i) in ws.snapshots"
          :key="snap.id"
          class="border rounded-lg p-3 space-y-2 hover:border-primary/40 transition-colors"
        >
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-xs font-medium">Generation #{{ ws.snapshots.length - i }}</p>
              <p class="text-xs text-muted-foreground mt-0.5">
                {{ snap.createdAt ? formatDate(snap.createdAt.toDate ? snap.createdAt.toDate() : snap.createdAt) : 'Just now' }}
              </p>
            </div>
            <span class="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
              {{ (snap as any).filesCount ?? '?' }} files
            </span>
          </div>

          <Button
            size="sm"
            variant="outline"
            class="w-full text-xs h-7"
            :loading="restoringId === snap.id"
            @click="handleRestore(snap.id)"
          >
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
            Restore
          </Button>
        </div>
        </template>
      </div>
    </div>
  </div>
</template>
