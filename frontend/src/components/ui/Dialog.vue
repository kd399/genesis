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
  title?: string
  description?: string
  class?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <!-- Overlay -->
      <DialogOverlay
        class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out"
      />
      <!-- Content -->
      <DialogContent
        :class="cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%]',
          'gap-4 border bg-background p-6 shadow-lg sm:rounded-lg',
          'data-[state=open]:animate-zoom-in data-[state=closed]:animate-zoom-out',
          props.class
        )"
        @pointer-down-outside="emit('update:open', false)"
        @escape-key-down="emit('update:open', false)"
      >
        <!-- Header -->
        <div v-if="title || description || $slots.header" class="flex flex-col space-y-1.5">
          <slot name="header">
            <DialogTitle
              v-if="title"
              class="text-lg font-semibold leading-none tracking-tight"
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

        <!-- Default slot — body content -->
        <slot />

        <!-- Footer slot -->
        <div
          v-if="$slots.footer"
          class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2"
        >
          <slot name="footer" />
        </div>

        <!-- Close button -->
        <DialogClose
          class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          @click="emit('update:open', false)"
        >
          <X class="h-4 w-4" />
          <span class="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
