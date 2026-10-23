<script setup lang="ts">
import { computed } from 'vue'
import type { CdStatus } from '../db/types'

// Petite pastille colorée : statut du CD et indice de confiance.
const props = defineProps<{ status: CdStatus; confidence?: number }>()

const info = computed(() => {
  switch (props.status) {
    case 'identifie':
      return { cls: 'badge-ok', text: 'Identifié' }
    case 'a_verifier':
      return { cls: 'badge-warn', text: 'À vérifier' }
    default:
      return { cls: 'badge-info', text: 'Manuel' }
  }
})
</script>

<template>
  <span class="badge" :class="info.cls">
    {{ info.text }}<template v-if="confidence !== undefined && status !== 'manuel'"> · {{ confidence }}%</template>
  </span>
</template>
