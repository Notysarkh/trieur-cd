<script setup lang="ts">
import { computed } from 'vue'
import type { Furniture } from '../layout/furniture'
import type { SlotContent } from '../layout/packer'

// Dessin d'un meuble : chaque case montre ses rangées, colorées par thème,
// avec le premier et le dernier artiste, et le taux de remplissage.

const props = defineProps<{ furniture: Furniture; slots: SlotContent[]; selected?: string }>()
const emit = defineEmits<{ select: [slotId: string] }>()

const byCase = computed(() => {
  const m = new Map<string, SlotContent[]>()
  for (const s of props.slots) {
    if (s.slot.furnitureId !== props.furniture.id) continue
    const key = `${s.slot.level}-${s.slot.column}`
    m.set(key, [...(m.get(key) ?? []), s])
  }
  return m
})

function rowName(s: SlotContent): string {
  const parts: string[] = []
  if (props.furniture.layers > 1) parts.push(s.slot.layer === 1 ? 'haut' : 'bas')
  if (props.furniture.depthRows > 1) parts.push(s.slot.depthRow === 1 ? 'devant' : 'derrière')
  return parts.join(' · ')
}
const pct = (s: SlotContent) => Math.round((s.usedMm / s.slot.capacityMm) * 100)
</script>

<template>
  <div class="furniture">
    <div class="grid" :style="{ gridTemplateColumns: `repeat(${furniture.columns}, minmax(0, 1fr))` }">
      <template v-for="level in furniture.levels" :key="level">
        <div v-for="column in furniture.columns" :key="`${level}-${column}`" class="case">
          <span class="case-name">Niv. {{ level }}<template v-if="furniture.columns > 1"> · {{ column }}</template></span>
          <div v-if="!byCase.get(`${level}-${column}`)" class="reserved">réservée</div>
          <button
            v-for="s in byCase.get(`${level}-${column}`)"
            :key="s.slot.id"
            class="row-band"
            :class="{ selected: selected === s.slot.id, empty: !s.cds.length }"
            :aria-label="`${s.slot.label} : ${s.cds.length} CD`"
            @click="emit('select', s.slot.id)"
          >
            <span class="fill">
              <span
                v-for="t in s.themes"
                :key="t.theme.id"
                class="segment"
                :style="{ width: `${(t.mm / s.slot.capacityMm) * 100}%`, background: t.theme.color }"
              ></span>
            </span>
            <span class="text">
              <span class="who">
                <template v-if="s.cds.length">{{ s.first }}<template v-if="s.last !== s.first"> → {{ s.last }}</template></template>
                <template v-else>vide</template>
              </span>
              <span class="meta">
                <template v-if="rowName(s)">{{ rowName(s) }} · </template>{{ s.cds.length }} CD · {{ pct(s) }} %
              </span>
            </span>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.furniture {
  border: 6px solid #a47c52;
  border-radius: 6px;
  background: #a47c52;
}
.grid {
  display: grid;
  gap: 4px;
}
.case {
  background: var(--surface);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.case-name {
  font-size: 0.65rem;
  color: var(--muted);
}
.reserved {
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: var(--muted);
  background: repeating-linear-gradient(45deg, transparent 0 6px, var(--border) 6px 8px);
  border-radius: 4px;
}
.row-band {
  position: relative;
  display: block;
  width: 100%;
  min-height: 36px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  overflow: hidden;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
}
.row-band.selected {
  outline: 3px solid var(--accent);
  outline-offset: 1px;
}
.fill {
  position: absolute;
  inset: 0;
  display: flex;
  opacity: 0.85;
}
.segment {
  height: 100%;
}
.text {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 3px 6px;
  font-size: 0.72rem;
  line-height: 1.25;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
.row-band.empty .text {
  color: var(--muted);
  text-shadow: none;
}
.who {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  opacity: 0.95;
}
</style>
