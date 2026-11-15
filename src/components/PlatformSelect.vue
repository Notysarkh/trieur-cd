<script setup lang="ts">
import type { Platform } from '../db/types'
import { MY_PLATFORMS, PLATFORMS } from '../lib/platforms'

// Liste déroulante des consoles : les tiennes d'abord, puis les autres.

defineProps<{
  modelValue: Platform | undefined
  /** Texte du choix « aucune console » (absent = choix obligatoire). */
  emptyLabel?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [Platform | undefined] }>()

const mine = MY_PLATFORMS.map((id) => PLATFORMS.find((p) => p.id === id)!)
const others = PLATFORMS.filter((p) => !MY_PLATFORMS.includes(p.id))

function onChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  emit('update:modelValue', (v || undefined) as Platform | undefined)
}
</script>

<template>
  <select :value="modelValue ?? ''" aria-label="Console" @change="onChange">
    <option v-if="emptyLabel !== undefined || !modelValue" value="">{{ emptyLabel ?? 'Choisis la console…' }}</option>
    <optgroup label="Mes consoles">
      <option v-for="p in mine" :key="p.id" :value="p.id">{{ p.label }}</option>
    </optgroup>
    <optgroup label="Autres consoles">
      <option v-for="p in others" :key="p.id" :value="p.id">{{ p.label }}</option>
    </optgroup>
  </select>
</template>
