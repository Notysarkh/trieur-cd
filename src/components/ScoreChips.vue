<script setup lang="ts">
import { computed } from 'vue'
import type { Cd } from '../db/types'
import { scoreChips } from '../lib/scores'

// Avis extérieurs d'un objet : petites pastilles (« MC 87 », « IMDb 7,8 »…), avec lien sur la fiche.

const props = defineProps<{ cd: Cd; links?: boolean }>()
const chips = computed(() => scoreChips(props.cd))
</script>

<template>
  <span v-if="chips.length" class="chips">
    <template v-for="c in chips" :key="c.key">
      <a v-if="links && c.url" class="chip-score" :href="c.url" target="_blank" rel="noopener" :title="c.source">
        <span class="src">{{ c.short }}</span> {{ c.text }}
      </a>
      <span v-else class="chip-score" :title="c.source"><span class="src">{{ c.short }}</span> {{ c.text }}</span>
    </template>
  </span>
</template>

<style scoped>
.chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip-score {
  font-size: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1px 6px;
  white-space: nowrap;
  color: inherit;
  text-decoration: none;
}
.src {
  font-weight: 700;
  opacity: 0.7;
}
</style>
