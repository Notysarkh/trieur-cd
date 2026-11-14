<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db } from '../db/database'
import type { Cd } from '../db/types'
import { MEDIA, mediaOf, type MediaKind } from '../lib/media'
import { saveSetting, settings } from '../services/settings'

// Accueil de Mediamwa : on choisit l'univers (CD, livres, films, jeux).
// Chaque univers a sa collection, son scanner, son classement et son rangement.

const router = useRouter()
const all = useLiveQuery(() => db.cds.toArray(), [] as Cd[])

const stats = computed(() => {
  const s = new Map<MediaKind, { total: number; placed: number; shelved: number }>()
  for (const m of MEDIA) s.set(m.id, { total: 0, placed: 0, shelved: 0 })
  for (const item of all.value) {
    const st = s.get(mediaOf(item))!
    st.total++
    if (item.location) st.placed++
    if (item.shelvedAt) st.shelved++
  }
  return s
})

async function open(media: MediaKind) {
  await saveSetting('lastMedia', media)
  await router.push('/collection')
}
</script>

<template>
  <main class="page stack home">
    <header class="stack-tight">
      <h1 class="brand">Mediamwa</h1>
      <p class="muted">Que veux-tu ranger aujourd'hui ?</p>
    </header>

    <div class="tiles">
      <button
        v-for="m in MEDIA"
        :key="m.id"
        class="tile"
        :class="{ current: settings.lastMedia === m.id, soon: m.comingInStep }"
        @click="open(m.id)"
      >
        <span class="tile-icon" aria-hidden="true">{{ m.icon }}</span>
        <span class="tile-label">{{ m.label }}</span>
        <span v-if="stats.get(m.id)!.total" class="tile-count">
          {{ stats.get(m.id)!.total }} {{ stats.get(m.id)!.total > 1 ? m.many : m.one }}
        </span>
        <span v-if="stats.get(m.id)!.placed" class="tile-progress">
          <span class="bar"><span :style="{ width: `${(100 * stats.get(m.id)!.shelved) / stats.get(m.id)!.placed}%` }"></span></span>
          {{ stats.get(m.id)!.shelved }} / {{ stats.get(m.id)!.placed }} rangés
        </span>
        <span v-else-if="m.comingInStep" class="tile-soon">Bientôt (étape {{ m.comingInStep }})</span>
      </button>
    </div>

    <RouterLink to="/reglages" class="btn">⚙️ Réglages et sauvegarde</RouterLink>
  </main>
</template>

<style scoped>
.home {
  max-width: 640px;
  margin: 0 auto;
}
.brand {
  font-size: 2rem;
  letter-spacing: 0.02em;
}
.stack-tight > * + * {
  margin-top: 4px;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-height: 150px;
  padding: 16px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.tile.current {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary) inset;
}
.tile-icon {
  font-size: 2.4rem;
  line-height: 1;
}
.tile-label {
  font-weight: 700;
  font-size: 1.1rem;
}
.tile-count,
.tile-progress,
.tile-soon {
  font-size: 0.85rem;
  color: var(--muted);
}
.tile.soon .tile-icon {
  opacity: 0.6;
}
.tile-progress {
  width: 100%;
}
.bar {
  display: block;
  height: 6px;
  border-radius: 3px;
  background: var(--border);
  overflow: hidden;
  margin-bottom: 4px;
}
.bar > span {
  display: block;
  height: 100%;
  background: var(--ok, #2e7d32);
}
</style>
