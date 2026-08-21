<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import { X, FilePlus, FilePen, FileX, GitCompareArrows } from 'lucide-vue-next'

const ws = useWorkspaceStore()
const diff = computed(() => ws.diffView)

const selectedDiff = computed(() =>
  diff.value.diffs.find(d => d.path === diff.value.selectedPath) ?? null
)

const statusMeta = {
  added:    { label: 'Added',    variant: 'success'     as const, icon: FilePlus },
  modified: { label: 'Modified', variant: 'secondary'   as const, icon: FilePen  },
  deleted:  { label: 'Deleted',  variant: 'destructive' as const, icon: FileX    },
  unchanged:{ label: 'Unchanged',variant: 'outline'     as const, icon: FilePen  },
}

/** Split text into lines with line numbers */
function toLines(text: string): string[] {
  return text === '' ? [] : text.split('\n')
}

/** Naive line-level diff — returns segments tagged added/removed/same */
interface LineSeg {
  type: 'same' | 'added' | 'removed'
  lineNo: number   // line number in the respective side (1-based)
  text: string
}

function computeLineDiff(before: string, after: string): { left: LineSeg[]; right: LineSeg[] } {
  const bLines = toLines(before)
  const aLines = toLines(after)

  // LCS-based diff using a simple DP table
  const m = bLines.length
  const n = aLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (bLines[i] === aLines[j]) {
        dp[i]![j] = (dp[i + 1]![j + 1] ?? 0) + 1
      } else {
        dp[i]![j] = Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0)
      }
    }
  }

  const left: LineSeg[]  = []
  const right: LineSeg[] = []
  let i = 0, j = 0
  let leftNo = 1, rightNo = 1

  while (i < m || j < n) {
    if (i < m && j < n && bLines[i] === aLines[j]) {
      left.push( { type: 'same',    lineNo: leftNo++,  text: bLines[i]! })
      right.push({ type: 'same',    lineNo: rightNo++, text: aLines[j]! })
      i++; j++
    } else if (j < n && (i >= m || (dp[i]![j + 1] ?? 0) >= (dp[i + 1]![j] ?? 0))) {
      right.push({ type: 'added',   lineNo: rightNo++, text: aLines[j]! })
      j++
    } else {
      left.push( { type: 'removed', lineNo: leftNo++,  text: bLines[i]! })
      i++
    }
  }

  return { left, right }
}

const lineDiff = computed(() => {
  if (!selectedDiff.value) return null
  const d = selectedDiff.value
  if (d.status === 'added')   return computeLineDiff('', d.after)
  if (d.status === 'deleted') return computeLineDiff(d.before, '')
  return computeLineDiff(d.before, d.after)
})
</script>

<template>
  <div
    v-if="diff.isOpen"
    class="fixed inset-0 z-50 flex flex-col bg-background"
  >
    <!-- Header -->
    <div class="flex items-center gap-3 px-4 h-11 border-b shrink-0">
      <GitCompareArrows class="w-4 h-4 text-primary shrink-0" />
      <span class="font-semibold text-sm">Diff View</span>
      <span class="text-xs text-muted-foreground">
        Generation {{ diff.generationId?.slice(0, 8) ?? '' }}
      </span>

      <div class="flex items-center gap-2 ml-2">
        <Badge
          v-for="status in ['added','modified','deleted'] as const"
          :key="status"
          :variant="statusMeta[status].variant"
          class="text-[10px] gap-1"
        >
          {{ diff.diffs.filter(d => d.status === status).length }}
          {{ statusMeta[status].label }}
        </Badge>
      </div>

      <div class="flex-1" />

      <Button size="sm" variant="ghost" class="h-7 text-xs shrink-0" @click="ws.closeDiffView()">
        <X class="w-3.5 h-3.5 mr-1" />
        Close
      </Button>
    </div>

    <!-- Body -->
    <div class="flex flex-1 overflow-hidden min-h-0">

      <!-- File list sidebar -->
      <div class="w-56 border-r flex flex-col shrink-0 overflow-hidden">
        <div class="px-3 py-2 border-b">
          <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Changed Files
          </span>
        </div>
        <div class="flex-1 overflow-y-auto py-1">
          <button
            v-for="d in diff.diffs"
            :key="d.path"
            :class="[
              'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
              d.path === diff.selectedPath
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-foreground hover:bg-accent/50'
            ]"
            @click="ws.selectDiffFile(d.path)"
          >
            <component
              :is="statusMeta[d.status].icon"
              :class="[
                'w-3 h-3 shrink-0',
                d.status === 'added'    ? 'text-green-500' :
                d.status === 'deleted'  ? 'text-destructive' :
                'text-yellow-500'
              ]"
            />
            <span class="truncate flex-1">{{ d.path }}</span>
          </button>
        </div>
      </div>

      <!-- Diff panel -->
      <div class="flex-1 overflow-hidden flex flex-col min-w-0">
        <!-- File header -->
        <div v-if="selectedDiff" class="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
          <Badge :variant="statusMeta[selectedDiff.status].variant" class="text-[10px]">
            {{ statusMeta[selectedDiff.status].label }}
          </Badge>
          <span class="text-xs font-mono text-foreground">{{ selectedDiff.path }}</span>
        </div>

        <!-- Side-by-side diff -->
        <div v-if="lineDiff && selectedDiff" class="flex-1 overflow-auto font-mono text-xs">
          <div class="flex min-h-full">

            <!-- Left (before) -->
            <div class="flex-1 border-r min-w-0">
              <div class="px-2 py-1 text-[10px] text-muted-foreground bg-muted/20 border-b sticky top-0">
                {{ selectedDiff.status === 'added' ? '(empty)' : 'Before' }}
              </div>
              <div>
                <div
                  v-for="(seg, idx) in lineDiff.left"
                  :key="idx"
                  :class="[
                    'flex items-start min-h-[1.4rem]',
                    seg.type === 'removed' ? 'bg-red-50 dark:bg-red-950/30' : ''
                  ]"
                >
                  <span class="w-10 shrink-0 text-right pr-3 text-muted-foreground/50 select-none py-0.5 text-[10px]">
                    {{ seg.lineNo }}
                  </span>
                  <span
                    :class="[
                      'flex-1 px-2 py-0.5 whitespace-pre-wrap break-all',
                      seg.type === 'removed' ? 'text-red-700 dark:text-red-400' : ''
                    ]"
                  >{{ seg.text || ' ' }}</span>
                </div>
              </div>
            </div>

            <!-- Right (after) -->
            <div class="flex-1 min-w-0">
              <div class="px-2 py-1 text-[10px] text-muted-foreground bg-muted/20 border-b sticky top-0">
                {{ selectedDiff.status === 'deleted' ? '(deleted)' : 'After' }}
              </div>
              <div>
                <div
                  v-for="(seg, idx) in lineDiff.right"
                  :key="idx"
                  :class="[
                    'flex items-start min-h-[1.4rem]',
                    seg.type === 'added' ? 'bg-green-50 dark:bg-green-950/30' : ''
                  ]"
                >
                  <span class="w-10 shrink-0 text-right pr-3 text-muted-foreground/50 select-none py-0.5 text-[10px]">
                    {{ seg.lineNo }}
                  </span>
                  <span
                    :class="[
                      'flex-1 px-2 py-0.5 whitespace-pre-wrap break-all',
                      seg.type === 'added' ? 'text-green-700 dark:text-green-400' : ''
                    ]"
                  >{{ seg.text || ' ' }}</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="flex-1 flex items-center justify-center text-muted-foreground">
          <p class="text-sm">Select a file to view diff</p>
        </div>
      </div>

    </div>
  </div>
</template>
