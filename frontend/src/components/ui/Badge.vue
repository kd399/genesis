<script setup lang="ts">
import { cn } from '@/lib/utils'
import { cva } from 'class-variance-authority'
import { computed } from 'vue'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        success: 'border-transparent bg-green-500/15 text-green-700 dark:text-green-400'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

interface Props {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success'
  class?: string
}
const props = withDefaults(defineProps<Props>(), { variant: 'default' })
const classes = computed(() => cn(badgeVariants({ variant: props.variant }), props.class))
</script>

<template>
  <div :class="classes"><slot /></div>
</template>
