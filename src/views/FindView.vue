<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import CoverImage from '../components/CoverImage.vue'
import WhereToShelve from '../components/WhereToShelve.vue'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db } from '../db/database'
import type { Cd } from '../db/types'
import { digitsOnly } from '../lib/barcode'
import { fuzzyFilter } from '../lib/fuzzy'
import { shelvedDate } from '../services/collection'
import { shortLocation } from '../services/layout'
import { currentMedia } from '../services/settings'
import { itemLabel, mediaInfo, mediaOf } from '../lib/media'
import { platformLabel } from '../lib/platforms'

// « Où est ce CD ? » : tu tapes quelques lettres (même avec une faute), tu touches le CD,
// et la fiche montre son emplacement et ses voisins (prévus par le plan et réellement posés).

const everything = useLiveQuery(() => db.cds.toArray(), [] as Cd[])
/** On cherche dans l'univers en cours. */
const all = computed(() => everything.value.filter((c) => mediaOf(c) === currentMedia()))
const w = computed(() => mediaInfo(currentMedia()))
const query = ref('')
const selectedId = ref<string>()
const input = ref<HTMLInputElement>()

const text = (cd: Cd) =>
  `${cd.artist} ${cd.artistSort} ${cd.title} ${cd.series ?? ''} ${cd.composer ?? ''} ${cd.label ?? ''} ${cd.year ?? ''} ${cd.platform ? platformLabel(cd.platform) : ''}`
const results = computed(() => {
  const q = query.value.trim()
  if (q.length < 2) return []
  const digits = digitsOnly(q)
  if (digits.length >= 5) return all.value.filter((cd) => cd.barcode?.includes(digits)).slice(0, 10)
  return fuzzyFilter(all.value, q, text).slice(0, 10)
})
const name = (cd: Cd) => (cd.personalCompilation ? cd.title : itemLabel(cd))

function pick(cd: Cd) {
  selectedId.value = cd.id
  window.scrollTo({ top: 0 })
}
async function again() {
  selectedId.value = undefined
  query.value = ''
  await nextTick()
  input.value?.focus()
}
onMounted(() => input.value?.focus())
</script>

<template>
  <main class="page stack">
    <h1>Où est ce {{ w.one }} ?</h1>

    <template v-if="!selectedId">
      <input
        ref="input"
        v-model="query"
        type="search"
        class="big-input"
        :placeholder="`${currentMedia() === 'cd' ? 'Artiste' : currentMedia() === 'livre' ? 'Auteur, série' : currentMedia() === 'jeu' ? 'Console' : 'Réalisateur'}, titre, année… (les fautes passent)`"
        :aria-label="`Rechercher un ${w.one}`"
        autocomplete="off"
      />
      <ul class="results">
        <li v-for="cd in results" :key="cd.id">
          <button class="result" @click="pick(cd)">
            <CoverImage :urls="cd.coverUrls" :photo="cd.coverPhoto" :label="cd.title" :size="44" />
            <span class="grow text">
              <strong>{{ name(cd) }}</strong>
              <span class="small muted">
                {{ shortLocation(cd) ?? 'pas encore d’emplacement' }}
              </span>
            </span>
            <span v-if="cd.shelvedAt" class="badge badge-ok">rangé {{ shelvedDate(cd) }}</span>
            <span v-else class="badge badge-warn">à ranger</span>
          </button>
        </li>
      </ul>
      <p v-if="query.trim().length >= 2 && !results.length" class="notice">Aucun {{ w.one }} ne correspond.</p>
      <p v-else-if="query.trim().length < 2" class="small muted">Tape au moins 2 lettres, ou un code-barres.</p>
    </template>

    <template v-else>
      <button class="btn" @click="again">← Autre recherche</button>
      <WhereToShelve :key="selectedId" :cd-id="selectedId" done-label="Nouvelle recherche" @done="again" @close="again" />
    </template>
  </main>
</template>

<style scoped>
.big-input {
  font-size: 1.2rem;
  min-height: 52px;
}
.results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.result {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.text strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
