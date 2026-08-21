<script setup lang="ts">
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from 'radix-vue'
import { X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  side?: 'top' | 'bottom' | 'left' | 'right'
  title?: string
  description?: string
  class?: string
}

const props = withDefaults(defineProps<Props>(), { side: 'right' })
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const sideClass: Record<string, string> = {
  top:    'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
  bottom: 'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
  left:   'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
  right:  'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <!-- Overlay -->
      <DialogOverlay
        class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out"
        @click="emit('update:open', false)"
      />
      <!-- Sheet panel -->
      <DialogContent
        :class="cn(
          'fixed z-50 gap-4 bg-background p-6 shadow-lg',
          'transition ease-in-out data-[state=open]:duration-300 data-[state=closed]:duration-300',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'flex flex-col',
          sideClass[side],
          props.class
        )"
        @escape-key-down="emit('update:open', false)"
        @pointer-down-outside="emit('update:open', false)"
      >
        <!-- Header -->
        <div v-if="title || description || $slots.header" class="flex flex-col space-y-1.5">
          <slot name="header">
            <DialogTitle
              v-if="title"
              class="text-lg font-semibold text-foreground"
            >
              {{ title }}
            </DialogTitle>
            <DialogDescription
              v-if="description"
              class="text-sm text-muted-foreground"
            >
              {{ description }}
            </DialogDescription>
          </slot>
        </div>

        <!-- Body -->
        <slot />

        <!-- Footer -->
        <div v-if="$slots.footer" class="mt-auto flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
          <slot name="footer" />
        </div>

        <!-- Close button -->
        <DialogClose
          class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          @click="emit('update:open', false)"
        >
          <X class="h-4 w-4" />
          <span class="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
