<script setup lang="ts">
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'radix-vue'
import { cn } from '@/lib/utils'

interface Props {
  defaultValue?: string
  modelValue?: string
  class?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <TabsRoot
    :default-value="defaultValue"
    :model-value="modelValue"
    :class="cn('w-full', props.class)"
    @update:model-value="emit('update:modelValue', $event as string)"
  >
    <slot />
  </TabsRoot>
</template>
