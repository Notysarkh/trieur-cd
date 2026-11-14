<script setup lang="ts">
import { computed, ref } from 'vue'
import { buildPlan, UNCLASSIFIED_THEME } from '../classification/engine'
import CoverImage from '../components/CoverImage.vue'
import WhereToShelve from '../components/WhereToShelve.vue'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db, itemsOf } from '../db/database'
import type { ArtistInfo, Cd } from '../db/types'
import { fuzzyFilter } from '../lib/fuzzy'
import { withoutBarcode } from '../services/collection'
import { setShelved } from '../services/shelving'
import { inShelfOrder, type ShelfEntry } from '../services/layout'
import { settings } from '../services/settings'

// CD sans code-barres : méthode de la « pile triée ».
// 1) L'appli affiche ces CD dans l'ordre exact du rangement final ; tu tries ta pile physique dans cet ordre.
// 2) Tu les ranges un par un : la fiche « Où le ranger » s'ouvre, « Rangé ✓ » passe au suivant tout seul.

const all = useLiveQuery(() => itemsOf('cd'), [] as Cd[])
const artistInfos = useLiveQuery(
  async () => new Map((await db.artists.toArray()).map((a) => [a.mbArtistId, a])),
  new Map<string, ArtistInfo>(),
)
const plan = computed(() => buildPlan(all.value, settings.classification, artistInfos.value))

const step = ref<'trier' | 'ranger'>('trier')
const themeFilter = ref('tous')
const showShelved = ref(false)
const search = ref('')

const themeOf = (cd: Cd) => {
  // CD pas encore placé : le thème du classement actuel (son thème appliqué a pu changer depuis).
  const id = (!cd.location && plan.value.placement.get(cd.id)?.themeId) || cd.themeId || plan.value.placement.get(cd.id)?.themeId
  return (id && settings.classification.themes.find((t) => t.id === id)) || UNCLASSIFIED_THEME
}
const name = (cd: Cd) => (cd.personalCompilation || cd.isCompilation ? cd.title : cd.artist)

const noBarcode = computed(() => all.value.filter(withoutBarcode))
const toShelve = computed(() => noBarcode.value.filter((c) => !c.shelvedAt).length)

/** La pile, dans l'ordre du rangement final, avec les filtres. */
const pile = computed<ShelfEntry[]>(() => {
  const list = inShelfOrder(
    noBarcode.value.filter(
      (cd) => (showShelved.value || !cd.shelvedAt) && (themeFilter.value === 'tous' || themeOf(cd).id === themeFilter.value),
    ),
    all.value,
    plan.value,
  )
  return list
})
// Avec une recherche, les meilleures correspondances d'abord (pour retrouver un CD isolé).
const shown = computed(() =>
  fuzzyFilter(pile.value, search.value, (e) => `${e.cd.artist} ${e.cd.artistSort} ${e.cd.title} ${e.cd.year ?? ''}`),
)
const themesPresent = computed(() => {
  const ids = new Set(noBarcode.value.map((cd) => themeOf(cd).id))
  return [...settings.classification.themes, UNCLASSIFIED_THEME].filter((t) => ids.has(t.id))
})

// --- Étape « Ranger » : le CD en cours et le passage automatique au suivant ---
const currentId = ref<string>()
const current = computed(() => {
  const list = pile.value
  return list.find((e) => e.cd.id === currentId.value) ?? list.find((e) => !e.cd.shelvedAt)
})
const currentIndex = computed(() => pile.value.findIndex((e) => e.cd.id === current.value?.cd.id))

function open(cd: Cd) {
  currentId.value = cd.id
  step.value = 'ranger'
  window.scrollTo({ top: 0 })
}
function go(delta: number) {
  const next = pile.value[currentIndex.value + delta]
  if (next) currentId.value = next.cd.id
}
/** Après « Rangé ✓ » : le CD suivant pas encore rangé dans la pile. */
const lastDone = ref<Cd>()
async function undoLast() {
  if (!lastDone.value) return
  await setShelved(lastDone.value.id, false)
  currentId.value = lastDone.value.id
  lastDone.value = undefined
}

function next(done: Cd) {
  lastDone.value = done
  const list = pile.value
  const from = list.findIndex((e) => e.cd.id === done.id)
  const after = [...list.slice(from + 1), ...list.slice(0, from)].find((e) => !e.cd.shelvedAt && e.cd.id !== done.id)
  currentId.value = after?.cd.id
  window.scrollTo({ top: 0 })
}
</script>

<template>
  <main class="page stack">
    <RouterLink to="/rangement" class="small">← Retour au rangement</RouterLink>
    <h1>CD sans code-barres</h1>
    <p class="small muted">
      {{ toShelve }} à ranger sur {{ noBarcode.length }}.
      <template v-if="!settings.layoutAppliedAt"> Applique d'abord le rangement (onglet Rangement) pour connaître leur place.</template>
    </p>

    <div class="steps" role="tablist">
      <button role="tab" class="chip" :class="{ active: step === 'trier' }" @click="step = 'trier'">1. Trier la pile</button>
      <button role="tab" class="chip" :class="{ active: step === 'ranger' }" @click="step = 'ranger'">2. Ranger</button>
    </div>

    <div class="row filters">
      <select v-model="themeFilter" class="grow" aria-label="Filtrer par thème">
        <option value="tous">Tous les thèmes</option>
        <option v-for="t in themesPresent" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <label class="row small"><input v-model="showShelved" type="checkbox" /> Afficher aussi les rangés</label>
    </div>

    <!-- 1. Trier la pile -->
    <template v-if="step === 'trier'">
      <p class="notice small">
        Trie ta pile dans cet ordre : le n° 1 sur le dessus. Ensuite, passe à « 2. Ranger ». Tu peux aussi toucher un CD
        pour ouvrir directement sa fiche.
      </p>
      <div class="row">
        <input v-model="search" type="search" class="grow" placeholder="Retrouver un CD (artiste, titre…)" aria-label="Rechercher" />
        <RouterLink class="btn" to="/imprimer/sans-code">🖨️ Liste à cocher</RouterLink>
      </div>
      <ol class="pile">
        <li v-for="e in shown" :key="e.cd.id" :style="{ '--theme': themeOf(e.cd).color }">
          <button class="line" @click="open(e.cd)">
            <span class="rank">{{ pile.indexOf(e) + 1 }}</span>
            <CoverImage :urls="e.cd.coverUrls" :photo="e.cd.coverPhoto" :label="e.cd.title" :size="48" />
            <span class="grow text">
              <span class="artist">{{ name(e.cd) }}</span>
              <span v-if="!e.cd.personalCompilation && !e.cd.isCompilation" class="title">{{ e.cd.title }}</span>
              <span class="meta">
                <span class="theme">{{ themeOf(e.cd).name }}</span>
                <template v-if="e.slotLabel"> · {{ e.slotLabel }} · n° {{ e.position }}</template>
              </span>
            </span>
            <span v-if="e.cd.shelvedAt" class="badge badge-ok">✓</span>
          </button>
        </li>
      </ol>
      <p v-if="!shown.length" class="notice notice-ok">
        {{ search ? 'Aucun CD ne correspond.' : 'Aucun CD sans code-barres à ranger. 🎉' }}
      </p>
      <button v-if="shown.length && !search" class="btn btn-primary btn-big" @click="step = 'ranger'">
        Pile triée : commencer le rangement →
      </button>
    </template>

    <!-- 2. Ranger, un CD après l'autre -->
    <template v-else>
      <template v-if="current">
        <div class="row nav">
          <button class="btn btn-small" :disabled="currentIndex <= 0" @click="go(-1)">◀</button>
          <span class="grow center">CD <strong>{{ currentIndex + 1 }}</strong> / {{ pile.length }} de la pile</span>
          <button class="btn btn-small" :disabled="currentIndex >= pile.length - 1" @click="go(1)">▶</button>
        </div>
        <button v-if="lastDone" class="btn btn-small undo" @click="undoLast">
          ↩ Annuler le dernier : « {{ name(lastDone) }} »
        </button>
        <WhereToShelve :key="current.cd.id" :cd-id="current.cd.id" done-label="CD suivant" @done="next" @close="step = 'trier'" />
      </template>
      <template v-else>
        <p class="notice notice-ok">Tous les CD sans code-barres de cette sélection sont rangés. 🎉</p>
        <button v-if="lastDone" class="btn btn-small" @click="undoLast">↩ Annuler le dernier : « {{ name(lastDone) }} »</button>
      </template>
    </template>
  </main>
</template>

<style scoped>
.steps {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.steps .chip {
  padding: 10px;
  font-weight: 700;
}
.filters select {
  width: auto;
  min-width: 0;
}
.pile {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.line {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-left: 8px solid var(--theme);
  border-radius: var(--radius);
  background: var(--surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.rank {
  min-width: 2ch;
  font-size: 1.5rem;
  font-weight: 800;
  text-align: right;
}
.text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.artist {
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.2;
}
.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  font-size: 0.8rem;
  color: var(--muted);
}
.theme {
  color: var(--theme);
  font-weight: 700;
}
.undo {
  align-self: flex-start;
}
.center {
  text-align: center;
}
</style>
