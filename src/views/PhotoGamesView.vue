<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import CoverImage from '../components/CoverImage.vue'
import PhotoCapture from '../components/PhotoCapture.vue'
import PlatformSelect from '../components/PlatformSelect.vue'
import { useLiveQuery } from '../composables/useLiveQuery'
import { itemsOf } from '../db/database'
import type { Candidate, Cd, Platform } from '../db/types'
import { platformLabel } from '../lib/platforms'
import { addCd } from '../services/collection'
import { alreadyOwned, draftForPhotoGame, resolveSeenGame, sameGame, type PhotoGame } from '../services/photoGames'
import { saveSetting, settings } from '../services/settings'
import { hasAnthropicKey, readGamesFromPhoto } from '../services/vision'

// Jeux vidéo : identification par photo (jaquette, ou rangée de tranches).
// Claude lit les titres et la console, l'appli cherche chaque jeu (RAWG + BnF), tu vérifies puis tu ajoutes.

interface Row extends PhotoGame {
  id: number
  platform?: Platform
  add: boolean
  owned?: Cd
  /** Déjà dans la liste (même jeu sur une photo précédente) : décoché. */
  twin?: boolean
  resolving: boolean
}

const titleOf = (r: Row) => r.chosen?.draft.title ?? r.seen.title

const all = useLiveQuery(() => itemsOf('jeu'), [] as Cd[])
const rows = reactive<Row[]>([])
const reading = ref(false)
const error = ref('')
const photo = ref<string>()
const added = ref(0)
let nextId = 1

async function onPhoto(dataUrl: string) {
  photo.value = dataUrl
  error.value = ''
  added.value = 0
  reading.value = true
  try {
    const seen = await readGamesFromPhoto(dataUrl, settings.scanPlatform || undefined)
    if (!seen.length) error.value = 'Aucun jeu reconnu sur cette photo : rapproche-toi, évite les reflets, et cadre les boîtes bien droites.'
    const fresh = seen.map((s) => {
      const row = reactive<Row>({ id: nextId++, seen: s, candidates: [], platform: s.platform, add: false, resolving: true })
      rows.push(row)
      return row
    })
    // Recherche de chaque jeu, l'un après l'autre (RAWG et la BnF limitent le rythme).
    for (const row of fresh) {
      const r = await resolveSeenGame(row.seen)
      row.candidates = r.candidates
      row.chosen = r.chosen
      row.error = r.error
      row.platform ??= r.chosen?.draft.platform
      row.owned = alreadyOwned(all.value, titleOf(row), row.platform)
      row.twin = rows.some((o) => o !== row && !o.resolving && sameGame({ title: titleOf(o), platform: o.platform }, { title: titleOf(row), platform: row.platform }))
      row.add = !row.owned && !row.twin && (!!row.chosen || row.seen.confidence !== 'basse')
      row.resolving = false
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Lecture impossible pour le moment.'
  } finally {
    reading.value = false
  }
}

function choose(row: Row, key: string) {
  row.chosen = row.candidates.find((c: Candidate) => c.key === key)
  row.platform = row.chosen?.draft.platform ?? row.platform
}

const toAdd = computed(() => rows.filter((r) => r.add && !r.resolving))
const busy = computed(() => reading.value || rows.some((r) => r.resolving))

async function addAll() {
  let n = 0
  for (const row of toAdd.value) {
    await addCd(draftForPhotoGame(row, row.platform))
    n++
  }
  added.value = n
  rows.splice(0, rows.length)
  photo.value = undefined
}
</script>

<template>
  <main class="page stack">
    <RouterLink to="/scan" class="small">← Retour au scanner</RouterLink>
    <h1>📸 Jeux par photo</h1>
    <p v-if="!hasAnthropicKey()" class="notice notice-warn">
      Il faut d'abord ta clé API Anthropic dans les <RouterLink to="/reglages">Réglages</RouterLink> (section
      « Reconnaissance par photo »).
    </p>
    <template v-else>
      <p class="small muted">
        Photographie une jaquette, ou une rangée de jeux vus par la tranche (20 à 30 d'un coup, bien droits, sans
        reflets). Claude lit les titres et la console, puis l'appli cherche chaque jeu. Vérifie la liste avant d'ajouter.
        La photo est envoyée à Anthropic pour être lue.
      </p>
      <label class="stack">
        <span class="small"><strong>Console des jeux photographiés</strong> (aide la lecture des tranches)</span>
        <PlatformSelect :model-value="settings.scanPlatform || undefined" empty-label="Plusieurs consoles / à deviner" @update:model-value="saveSetting('scanPlatform', $event ?? '')" />
      </label>
      <PhotoCapture :has-photo="!!photo" hd :label="rows.length ? 'Photo suivante' : 'Prendre la photo'" @photo="onPhoto" />
      <p v-if="reading" class="notice small">Lecture de la photo…</p>
      <p v-if="error" class="notice notice-warn small">{{ error }}</p>
      <p v-if="added" class="notice notice-ok small">{{ added }} jeu{{ added > 1 ? 'x' : '' }} ajouté{{ added > 1 ? 's' : '' }} à ta collection.</p>

      <ul v-if="rows.length" class="plain stack list">
        <li v-for="row in rows" :key="row.id" class="card row item" :class="{ off: !row.add }">
          <input v-model="row.add" type="checkbox" :aria-label="`Ajouter ${row.seen.title}`" :disabled="row.resolving" />
          <CoverImage :urls="row.chosen?.draft.coverUrls ?? []" :label="row.seen.title" :size="48" />
          <div class="grow stack info">
            <div>
              <strong>{{ row.chosen?.draft.title ?? row.seen.title }}</strong>
              <span v-if="row.seen.confidence !== 'haute'" class="badge badge-warn">lecture {{ row.seen.confidence }}</span>
            </div>
            <span class="small muted">
              Lu : « {{ row.seen.title }} »<template v-if="row.seen.platform"> · {{ platformLabel(row.seen.platform) }}</template>
            </span>
            <span v-if="row.resolving" class="small muted">Recherche…</span>
            <span v-else-if="row.owned" class="small badge badge-info">Déjà dans ta collection</span>
            <span v-else-if="row.twin" class="small badge badge-info">Déjà dans la liste (photo précédente)</span>
            <span v-else-if="!row.chosen" class="small muted">Pas trouvé : il sera ajouté « à vérifier ».</span>
            <select v-if="row.candidates.length > 1" :value="row.chosen?.key ?? ''" class="small" aria-label="Autre résultat" @change="choose(row, ($event.target as HTMLSelectElement).value)">
              <option value="">— garder le titre lu —</option>
              <option v-for="c in row.candidates" :key="c.key" :value="c.key">
                {{ c.draft.title }}<template v-if="c.draft.platform"> · {{ platformLabel(c.draft.platform) }}</template><template v-if="c.draft.year"> · {{ c.draft.year }}</template>
              </option>
            </select>
            <PlatformSelect :model-value="row.platform" empty-label="Console ?" @update:model-value="row.platform = $event" />
          </div>
        </li>
      </ul>
      <button v-if="rows.length" class="btn btn-primary btn-big" :disabled="busy || !toAdd.length" @click="addAll">
        {{ busy ? 'Recherche en cours…' : `✓ Ajouter ${toAdd.length} jeu${toAdd.length > 1 ? 'x' : ''}` }}
      </button>
    </template>
  </main>
</template>

<style scoped>
.list {
  gap: 6px;
}
.item {
  flex-wrap: nowrap;
  align-items: flex-start;
  padding: 10px;
}
.item.off {
  opacity: 0.55;
}
.info {
  gap: 4px;
  min-width: 0;
}
</style>
