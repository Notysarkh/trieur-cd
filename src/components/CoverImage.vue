<script setup lang="ts">
import { computed, ref, watch } from 'vue'

// Affiche une pochette. On essaie chaque adresse dans l'ordre jusqu'à en trouver une qui marche ;
// à défaut, on affiche les initiales de l'album.

const props = withDefaults(
  defineProps<{ urls?: string[]; photo?: string; label?: string; size?: number }>(),
  { urls: () => [], size: 56, label: '' },
)

const sources = computed(() => [...(props.photo ? [props.photo] : []), ...props.urls])
const index = ref(0)
watch(sources, () => (index.value = 0))

const current = computed(() => sources.value[index.value])
const initials = computed(
  () =>
    props.label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?',
)
</script>

<template>
  <div class="cover" :style="{ width: `${size}px`, height: `${size}px` }">
    <img
      v-if="current"
      :key="current"
      :src="current"
      :alt="label ? `Pochette de ${label}` : 'Pochette'"
      loading="lazy"
      @error="index++"
    />
    <span v-else aria-hidden="true">{{ initials }}</span>
  </div>
</template>

<style scoped>
.cover {
  flex: none;
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-weight: 700;
}
img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
