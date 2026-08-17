<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'

const ws = useWorkspaceStore()

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children?: TreeNode[]
}

const tree = computed((): TreeNode[] => {
  const nodes: TreeNode[] = []
  const dirs = new Map<string, TreeNode>()

  // Sort files
  const sorted = [...ws.files].sort((a, b) => a.path.localeCompare(b.path))

  sorted.forEach(file => {
    const parts = file.path.split('/')
    if (parts.length === 1) {
      nodes.push({ name: file.path, path: file.path, isDir: false })
    } else {
      // Create dir nodes
      let currentPath = ''
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!
        currentPath = currentPath ? `${currentPath}/${part}` : part
        if (!dirs.has(currentPath)) {
          const dirNode: TreeNode = { name: part, path: currentPath, isDir: true, children: [] }
          dirs.set(currentPath, dirNode)
          if (i === 0) {
            const existing = nodes.find(n => n.path === currentPath)
            if (!existing) nodes.push(dirNode)
          } else {
            const parentPath = parts.slice(0, i).join('/')
            const parent = dirs.get(parentPath)
            parent?.children?.push(dirNode)
          }
        }
      }
      // Add file to its dir
      const dirPath = parts.slice(0, -1).join('/')
      const dir = dirs.get(dirPath)
      const fileNode: TreeNode = { name: parts[parts.length - 1]!, path: file.path, isDir: false }
      if (dir) {
        dir.children?.push(fileNode)
      } else {
        nodes.push(fileNode)
      }
    }
  })
  return nodes
})

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  const icons: Record<string, string> = {
    html: '🌐',
    js: '📜',
    ts: '📘',
    vue: '💚',
    css: '🎨',
    json: '📋',
    md: '📝'
  }
  return icons[ext ?? ''] ?? '📄'
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="px-3 py-2 border-b">
      <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Files</span>
    </div>

    <div class="flex-1 overflow-y-auto py-1">
      <div v-if="ws.files.length === 0" class="px-3 py-4 text-xs text-muted-foreground text-center">
        No files yet — generate an app to get started
      </div>

      <template v-else>
        <FileNode
          v-for="node in tree"
          :key="node.path"
          :node="node"
          :depth="0"
          :active-path="ws.activeFilePath"
          @select="ws.selectFile($event)"
        />
      </template>
    </div>
  </div>
</template>

<script lang="ts">
// Recursive FileNode as a sub-component
import { defineComponent, h, type PropType } from 'vue'

interface TreeNodeDef {
  name: string
  path: string
  isDir: boolean
  children?: TreeNodeDef[]
}

const FileNode = defineComponent({
  name: 'FileNode',
  props: {
    node: { type: Object as PropType<TreeNodeDef>, required: true },
    depth: { type: Number, default: 0 },
    activePath: { type: String, default: null }
  },
  emits: ['select'],
  setup(props, { emit }) {
    const isActive = () => props.activePath === props.node.path

    const getIcon = (name: string) => {
      if (props.node.isDir) return '📁'
      const ext = name.split('.').pop()?.toLowerCase()
      const icons: Record<string, string> = {
        html: '🌐',
        js: '📜',
        ts: '📘',
        vue: '💚',
        css: '🎨',
        json: '📋',
        md: '📝'
      }
      return icons[ext ?? ''] ?? '📄'
    }

    return () =>
      h('div', {}, [
        h(
          'button',
          {
            class: [
              'w-full flex items-center gap-1.5 px-2 py-0.5 text-left text-xs hover:bg-accent transition-colors',
              isActive() ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground'
            ],
            style: { paddingLeft: `${props.depth * 12 + 8}px` },
            onClick: () => {
              if (!props.node.isDir) emit('select', props.node.path)
            }
          },
          [
            h('span', { class: 'shrink-0 text-[10px]' }, getIcon(props.node.name)),
            h('span', { class: 'truncate' }, props.node.name)
          ]
        ),
        ...(props.node.children?.map(child =>
          h(FileNode, {
            key: child.path,
            node: child,
            depth: props.depth + 1,
            activePath: props.activePath,
            onSelect: (path: string) => emit('select', path)
          })
        ) ?? [])
      ])
  }
})

export { FileNode }
</script>
