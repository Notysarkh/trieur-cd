<script setup lang="ts">
import { computed } from 'vue'
import type { Furniture } from '../layout/furniture'

// Petit dessin d'un meuble avec la rangée d'un CD en surbrillance : pour le retrouver d'un coup d'œil.

const props = defineProps<{ furniture: Furniture; slotId: string; position: number }>()

const target = computed(() => {
  const [level, column, layer, depthRow] = props.slotId.split(':')[1].split('-').map(Number)
  return { level, column, layer, depthRow }
})
const isTarget = (level: number, column: number) => level === target.value.level && column === target.value.column
const rowsOf = computed(() => props.furniture.layers * props.furniture.depthRows)
const rowIndex = computed(() => (target.value.layer - 1) * props.furniture.depthRows + target.value.depthRow)
</script>

<template>
  <div class="map" :aria-label="`Position dans ${furniture.name}`">
    <div class="grid" :style="{ gridTemplateColumns: `repeat(${furniture.columns}, minmax(0, 1fr))` }">
      <template v-for="level in furniture.levels" :key="level">
        <div
          v-for="column in furniture.columns"
          :key="`${level}-${column}`"
          class="case"
          :class="{ on: isTarget(level, column), off: furniture.reserved.includes(`${level}-${column}`) }"
        >
          <template v-if="isTarget(level, column)">
            <span v-for="r in rowsOf" :key="r" class="row" :class="{ hit: r === rowIndex }">
              <template v-if="r === rowIndex">n° {{ position }}</template>
            </span>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.map {
  border: 4px solid #a47c52;
  border-radius: 4px;
  background: #a47c52;
  max-width: 220px;
}
.grid {
  display: grid;
  gap: 3px;
}
.case {
  min-height: 14px;
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px;
}
.case.off {
  background: repeating-linear-gradient(45deg, transparent 0 4px, var(--border) 4px 5px);
}
.case.on {
  background: var(--surface);
}
.row {
  min-height: 12px;
  border-radius: 2px;
  background: var(--border);
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 14px;
  padding: 0 4px;
}
.row.hit {
  background: var(--accent);
  color: #1b1f2a;
}
</style>
