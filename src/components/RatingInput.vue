<script setup lang="ts">
// Ma note personnelle, sur 100 : curseur (pas de 5) + valeur ; « Effacer » retire la note.

const props = defineProps<{ modelValue: number | undefined }>()
const emit = defineEmits<{ 'update:modelValue': [number | undefined] }>()

function set(v: string) {
  const n = Math.round(Number(v))
  emit('update:modelValue', Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : undefined)
}
</script>

<template>
  <div class="rating row">
    <input
      type="range"
      min="0"
      max="100"
      step="5"
      class="grow"
      aria-label="Ma note sur 100"
      :value="props.modelValue ?? 50"
      :class="{ unset: props.modelValue === undefined }"
      @input="set(($event.target as HTMLInputElement).value)"
    />
    <input
      class="value"
      inputmode="numeric"
      aria-label="Ma note (nombre)"
      :value="props.modelValue ?? ''"
      placeholder="–"
      @change="set(($event.target as HTMLInputElement).value)"
    />
    <span class="muted small">/ 100</span>
    <button v-if="props.modelValue !== undefined" type="button" class="btn btn-small" @click="emit('update:modelValue', undefined)">
      Effacer
    </button>
  </div>
</template>

<style scoped>
.rating {
  flex-wrap: nowrap;
  align-items: center;
}
.value {
  width: 3.5em;
  text-align: center;
}
.unset {
  opacity: 0.4;
}
</style>
