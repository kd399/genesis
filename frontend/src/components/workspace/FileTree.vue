<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'

const ws = useWorkspaceStore()

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children?: TreeNode[]
}

const collapsedDirs = ref<Set<string>>(new Set())

function toggleDir(path: string) {
  const s = new Set(collapsedDirs.value)
  if (s.has(path)) s.delete(path)
  else s.add(path)
  collapsedDirs.value = s
}

const tree = computed((): TreeNode[] => {
  const nodes: TreeNode[] = []
  const dirs = new Map<string, TreeNode>()

  const sorted = [...ws.files].sort((a, b) => a.path.localeCompare(b.path))

  sorted.forEach(file => {
    const parts = file.path.split('/')
    if (parts.length === 1) {
      nodes.push({ name: file.path, path: file.path, isDir: false })
    } else {
      let currentPath = ''
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!
        currentPath = currentPath ? `${currentPath}/${part}` : part
        if (!dirs.has(currentPath)) {
          const dirNode: TreeNode = { name: part, path: currentPath, isDir: true, children: [] }
          dirs.set(currentPath, dirNode)
          if (i === 0) {
            if (!nodes.find(n => n.path === currentPath)) nodes.push(dirNode)
          } else {
            const parentPath = parts.slice(0, i).join('/')
            dirs.get(parentPath)?.children?.push(dirNode)
          }
        }
      }
      const dirPath = parts.slice(0, -1).join('/')
      const dir = dirs.get(dirPath)
      const fileNode: TreeNode = { name: parts[parts.length - 1]!, path: file.path, isDir: false }
      if (dir) dir.children?.push(fileNode)
      else nodes.push(fileNode)
    }
  })
  return nodes
})

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  const icons: Record<string, string> = {
    html: '🌐', js: '⚡', ts: '🔷', vue: '💚',
    css: '🎨', json: '📋', md: '📝'
  }
  return icons[ext ?? ''] ?? '📄'
}

const isStreaming = computed(() => ws.generationState.isGenerating)
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="px-3 py-2 border-b flex items-center justify-between shrink-0">
      <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Files</span>
      <span v-if="ws.files.length > 0" class="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
        {{ ws.files.length }}
      </span>
    </div>

    <div class="flex-1 overflow-y-auto py-1">
      <!-- Empty state -->
      <div v-if="ws.files.length === 0 && !isStreaming" class="px-3 py-6 text-center">
        <div class="text-2xl mb-2">📂</div>
        <p class="text-xs text-muted-foreground">No files yet</p>
        <p class="text-[10px] text-muted-foreground/60 mt-0.5">Generate an app to start</p>
      </div>

      <!-- Streaming placeholder -->
      <div v-else-if="ws.files.length === 0 && isStreaming" class="px-3 py-3 space-y-1.5">
        <div v-for="i in 3" :key="i" class="flex items-center gap-2 px-2 py-1">
          <div class="w-3 h-3 rounded bg-muted animate-pulse shrink-0" />
          <div class="h-2.5 bg-muted animate-pulse rounded flex-1" :style="`width:${60+i*15}%`" />
        </div>
      </div>

      <template v-else>
        <FileNodeVue
          v-for="node in tree"
          :key="node.path"
          :node="node"
          :depth="0"
          :active-path="ws.activeFilePath"
          :streaming-path="ws.activeStreamFile"
          :collapsed-dirs="collapsedDirs"
          @select="ws.selectFile($event)"
          @toggle-dir="toggleDir($event)"
        />
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, h, type PropType } from 'vue'

interface TreeNodeDef {
  name: string
  path: string
  isDir: boolean
  children?: TreeNodeDef[]
}

const FileNodeVue = defineComponent({
  name: 'FileNodeVue',
  props: {
    node: { type: Object as PropType<TreeNodeDef>, required: true },
    depth: { type: Number, default: 0 },
    activePath: { type: String, default: null },
    streamingPath: { type: String as PropType<string | null>, default: null },
    collapsedDirs: { type: Object as PropType<Set<string>>, required: true }
  },
  emits: ['select', 'toggleDir'],
  setup(props, { emit }) {
    const isActive = () => !props.node.isDir && props.activePath === props.node.path
    const isStreaming = () => props.streamingPath === props.node.path
    const isCollapsed = () => props.node.isDir && props.collapsedDirs.has(props.node.path)

    const getIcon = (node: TreeNodeDef) => {
      if (node.isDir) return isCollapsed() ? '📁' : '📂'
      const ext = node.name.split('.').pop()?.toLowerCase()
      const icons: Record<string, string> = {
        html: '🌐', js: '⚡', ts: '🔷', vue: '💚',
        css: '🎨', json: '📋', md: '📝'
      }
      return icons[ext ?? ''] ?? '📄'
    }

    return () =>
      h('div', {}, [
        h('button', {
          class: [
            'w-full flex items-center gap-1.5 py-[3px] text-left text-xs transition-colors rounded-sm mx-1',
            isActive()
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-foreground hover:bg-accent/50',
            props.node.isDir ? 'font-medium text-muted-foreground' : ''
          ],
          style: { paddingLeft: `${props.depth * 10 + 8}px`, paddingRight: '8px' },
          onClick: () => {
            if (props.node.isDir) emit('toggleDir', props.node.path)
            else emit('select', props.node.path)
          }
        }, [
          // Dir chevron
          props.node.isDir
            ? h('svg', {
                class: ['w-3 h-3 shrink-0 transition-transform', isCollapsed() ? '' : 'rotate-90'],
                fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor'
              }, [
                h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M9 5l7 7-7 7' })
              ])
            : h('span', { class: 'text-[10px] shrink-0' }, getIcon(props.node)),

          h('span', { class: 'truncate flex-1' }, props.node.name),

          // Streaming pulse
          isStreaming()
            ? h('span', { class: 'w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0 ml-auto' })
            : null
        ]),

        // Children (if dir not collapsed)
        ...(!isCollapsed() && props.node.children
          ? props.node.children.map(child =>
              h(FileNodeVue, {
                key: child.path,
                node: child,
                depth: props.depth + 1,
                activePath: props.activePath,
                streamingPath: props.streamingPath,
                collapsedDirs: props.collapsedDirs,
                onSelect: (p: string) => emit('select', p),
                onToggleDir: (p: string) => emit('toggleDir', p)
              })
            )
          : [])
      ])
  }
})

export { FileNodeVue }
</script>
