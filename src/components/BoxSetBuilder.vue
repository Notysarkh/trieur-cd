<script setup lang="ts">
import { computed, ref } from 'vue'
import type { VideoFormat } from '../db/types'
import { searchFilms, VIDEO_FORMAT_LABELS } from '../services/films'
import { hasTmdbKey, sagaName, searchTmdbSaga } from '../services/tmdb'

// Création d'un coffret de films : tu donnes son nom, l'appli propose les films de la saga (TMDB),
// déjà cochés ; tu en ajoutes d'autres par une recherche par titre, tu décoches ceux qui n'y sont pas.
// Le résultat est UNE seule fiche (le coffret), avec la liste de ses films.

export interface BoxSetResult {
  name: string
  saga?: string
  videoFormat: VideoFormat
  contents: string[]
  genres: string[]
  year?: number
  artist: string
  artistSort: string
  coverUrls: string[]
}

const props = defineProps<{ initialName?: string; initialContents?: string[]; initialFormat?: VideoFormat; doneLabel?: string }>()
const emit = defineEmits<{ done: [BoxSetResult]; cancel: [] }>()

interface Film {
  key: string
  title: string
  year?: number
  genres: string[]
  artist?: string
  artistSort?: string
  poster?: string
  checked: boolean
}

const name = ref(props.initialName ?? '')
const format = ref<VideoFormat>(props.initialFormat ?? 'dvd')
const films = ref<Film[]>((props.initialContents ?? []).map((t, i) => ({ key: `deja:${i}`, title: t, genres: [], checked: true })))
const saga = ref<{ name: string; poster?: string }>()
const busy = ref(false)
const message = ref('')

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
function addFilm(f: Omit<Film, 'checked'>) {
  if (films.value.some((x) => norm(x.title) === norm(f.title))) return
  films.value.push({ ...f, checked: true })
}

/** Les films de la saga du même nom (TMDB), tous cochés. */
async function findSaga() {
  if (!name.value.trim()) return
  busy.value = true
  message.value = ''
  try {
    const s = await searchTmdbSaga(name.value.replace(/[,:\-–]?\s*(l['’]\s*)?(int[ée]grale|coffret|saga|collection).*$/i, '').trim(), 'high')
    if (!s || !s.parts.length) {
      message.value = 'Aucune saga trouvée sous ce nom : ajoute les films avec la recherche ci-dessous.'
      return
    }
    saga.value = { name: sagaName(s.name), poster: s.posterUrl }
    for (const p of s.parts) addFilm({ key: `tmdb:${p.id}`, title: p.title, year: p.year, genres: p.genres, poster: p.posterUrl })
    message.value = `${s.parts.length} films de la saga « ${sagaName(s.name)} » proposés : décoche ceux qui ne sont pas dans ton coffret.`
  } catch {
    message.value = 'TMDB ne répond pas pour le moment : ajoute les films avec la recherche ci-dessous.'
  } finally {
    busy.value = false
  }
}

// --- Ajouter un film par son titre ---
const query = ref('')
const results = ref<Film[] | null>(null)
async function search() {
  if (!query.value.trim()) return
  busy.value = true
  try {
    const found = await searchFilms(query.value)
    results.value = found.slice(0, 8).map((c) => ({
      key: c.key,
      title: c.draft.title,
      year: c.draft.year,
      genres: c.draft.genres,
      artist: c.draft.artist !== 'Réalisateur inconnu' ? c.draft.artist : undefined,
      artistSort: c.draft.artist !== 'Réalisateur inconnu' ? c.draft.artistSort : undefined,
      poster: c.draft.coverUrls[0],
      checked: true,
    }))
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'Recherche impossible pour le moment.'
  } finally {
    busy.value = false
  }
}
function pick(f: Film) {
  addFilm(f)
  results.value = null
  query.value = ''
}

const chosen = computed(() => films.value.filter((f) => f.checked))

function done() {
  const list = chosen.value
  const withYear = list.filter((f) => f.year)
  const director = list.find((f) => f.artist)
  // Réalisateur : le même pour tous les films trouvés, sinon « Réalisateurs divers ».
  const sameDirector = director && list.every((f) => !f.artist || f.artist === director.artist)
  emit('done', {
    name: name.value.trim() || saga.value?.name || 'Coffret',
    saga: saga.value?.name ?? (name.value.replace(/[,:\-–]?\s*(l['’]\s*)?(int[ée]grale|coffret|saga|collection).*$/i, '').trim() || undefined),
    videoFormat: format.value,
    contents: list.map((f) => f.title),
    genres: list.find((f) => f.genres.length)?.genres ?? [],
    year: withYear.length ? Math.max(...withYear.map((f) => f.year!)) : undefined,
    artist: sameDirector ? director.artist! : 'Réalisateurs divers',
    artistSort: sameDirector ? (director.artistSort ?? director.artist!) : 'Divers',
    coverUrls: [saga.value?.poster, list[0]?.poster].filter((u): u is string => !!u),
  })
}
</script>

<template>
  <section class="card stack builder">
    <h2>📦 Coffret</h2>
    <label class="field">
      Nom du coffret
      <input v-model="name" placeholder="ex. Harry Potter : l'intégrale" autocomplete="off" @keydown.enter.prevent="findSaga" />
    </label>
    <div class="row">
      <label class="field grow">
        Support
        <select v-model="format">
          <option v-for="(label, key) in VIDEO_FORMAT_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <button v-if="hasTmdbKey()" class="btn" type="button" :disabled="busy || !name.trim()" @click="findSaga">🎬 Films de la saga</button>
    </div>
    <p v-if="!hasTmdbKey()" class="small muted">Avec une clé TMDB (Réglages), l'appli propose directement les films de la saga.</p>
    <p v-if="message" class="small notice">{{ message }}</p>

    <div v-if="films.length" class="stack list">
      <label v-for="f in films" :key="f.key" class="row film" :class="{ off: !f.checked }">
        <input v-model="f.checked" type="checkbox" />
        <span class="grow">{{ f.title }}<span v-if="f.year" class="muted"> ({{ f.year }})</span></span>
      </label>
    </div>

    <form class="row" @submit.prevent="search">
      <input v-model="query" type="search" class="grow" placeholder="Ajouter un film : son titre" aria-label="Titre d'un film à ajouter" enterkeyhint="search" />
      <button class="btn btn-small" type="submit" :disabled="busy || !query.trim()">🔎</button>
    </form>
    <ul v-if="results" class="plain results">
      <li v-if="!results.length" class="small muted">Aucun résultat.</li>
      <li v-for="r in results" :key="r.key">
        <button type="button" class="btn btn-small result" @click="pick(r)">
          + {{ r.title }}<span v-if="r.year" class="muted"> ({{ r.year }})</span><span v-if="r.artist" class="muted"> · {{ r.artist }}</span>
        </button>
      </li>
    </ul>

    <div class="row">
      <button class="btn" type="button" @click="emit('cancel')">Annuler</button>
      <button class="btn btn-primary grow" type="button" :disabled="!chosen.length" @click="done">
        {{ doneLabel ?? 'Continuer' }} ({{ chosen.length }} film{{ chosen.length > 1 ? 's' : '' }})
      </button>
    </div>
  </section>
</template>

<style scoped>
.list {
  gap: 2px;
}
.film {
  flex-wrap: nowrap;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--surface-2);
}
.film.off {
  opacity: 0.5;
  text-decoration: line-through;
}
.results {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.result {
  width: 100%;
  text-align: left;
}
</style>
