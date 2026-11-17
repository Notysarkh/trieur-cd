<script setup lang="ts">
import { computed, ref } from 'vue'
import type { VideoFormat } from '../db/types'
import { seasonContent } from '../lib/seasons'
import { searchFilms, VIDEO_FORMAT_LABELS } from '../services/films'
import { hasTmdbKey, sagaName, searchTmdbSaga, searchTmdbShows, tmdbShow, type TmdbResult, type TmdbShow } from '../services/tmdb'

// Création d'un coffret :
// - de FILMS : tu donnes son nom, l'appli propose les films de la saga (TMDB) déjà cochés ; tu en ajoutes d'autres
//   par une recherche par titre et tu décoches ceux qui n'y sont pas ;
// - de SÉRIE : tu cherches la série (TMDB), puis tu coches les saisons qui sont dans le coffret
//   (sans clé TMDB : tu indiques le nombre de saisons).
// Le résultat est UNE seule fiche (le coffret), avec la liste de ses films ou de ses saisons.

export interface BoxSetResult {
  name: string
  saga?: string
  videoFormat: VideoFormat
  contents: string[]
  /** Coffret de série : les numéros des saisons qu'il contient. */
  seasons?: number[]
  genres: string[]
  year?: number
  artist: string
  artistSort: string
  coverUrls: string[]
}

const props = defineProps<{
  initialName?: string
  initialContents?: string[]
  initialFormat?: VideoFormat
  initialSeries?: string
  initialSeasons?: number[]
  doneLabel?: string
}>()
const emit = defineEmits<{ done: [BoxSetResult]; cancel: [] }>()

const kind = ref<'films' | 'serie'>(props.initialSeasons?.length ? 'serie' : 'films')
const name = ref(props.initialName ?? '')
const format = ref<VideoFormat>(props.initialFormat ?? 'dvd')
const busy = ref(false)
const message = ref('')
/** Nom du coffret sans « l'intégrale », « coffret »… (sert à chercher la saga ou la série). */
const baseName = () => name.value.replace(/\s*[,:\-–]?\s*(l['’]\s*)?(int[ée]grale|coffret|saga|collection|saisons?\b).*$/i, '').trim()

// ---------------------------------------------------------------- Films (saga)

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

const films = ref<Film[]>(
  props.initialSeasons?.length ? [] : (props.initialContents ?? []).map((t, i) => ({ key: `deja:${i}`, title: t, genres: [], checked: true })),
)
const saga = ref<{ name: string; poster?: string }>()

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
    const s = await searchTmdbSaga(baseName(), 'high')
    if (!s || !s.parts.length) {
      message.value = 'Aucune saga de films trouvée sous ce nom. Si c\'est une série, choisis « 📺 Série TV » ; sinon ajoute les films avec la recherche ci-dessous.'
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

// ---------------------------------------------------------------- Série TV (saisons)

const shows = ref<TmdbResult[] | null>(null)
const show = ref<TmdbShow>()
/** Saisons proposées (sans clé TMDB : 1 à N, N choisi par toi). */
const seasonList = ref<{ number: number; label: string; year?: number }[]>([])
const checkedSeasons = ref<number[]>([...(props.initialSeasons ?? [])])
const seriesName = ref(props.initialSeries ?? '')
const seasonCount = ref<number>(Math.max(0, ...(props.initialSeasons ?? [])) || 0)

function manualSeasons(n: number) {
  seasonCount.value = Math.max(0, Math.min(60, Math.round(n) || 0))
  seasonList.value = Array.from({ length: seasonCount.value }, (_, i) => ({ number: i + 1, label: `Saison ${i + 1}` }))
  // Toutes cochées au départ : tu décoches celles qui manquent.
  if (!checkedSeasons.value.length) checkedSeasons.value = seasonList.value.map((s) => s.number)
  else checkedSeasons.value = checkedSeasons.value.filter((n) => n <= seasonCount.value)
}
if (props.initialSeasons?.length) manualSeasons(seasonCount.value)

async function findShows() {
  if (!name.value.trim()) return
  busy.value = true
  message.value = ''
  try {
    shows.value = await searchTmdbShows(baseName())
    if (!shows.value.length) message.value = 'Aucune série trouvée sous ce nom : indique le nombre de saisons ci-dessous.'
  } catch {
    message.value = 'TMDB ne répond pas pour le moment : indique le nombre de saisons ci-dessous.'
  } finally {
    busy.value = false
  }
}
async function chooseShow(r: TmdbResult) {
  busy.value = true
  try {
    show.value = await tmdbShow(r.id)
    seriesName.value = show.value.name
    seasonList.value = show.value.seasons.map((s) => ({
      number: s.number,
      label: s.number === 0 ? 'Épisodes spéciaux' : `Saison ${s.number}`,
      year: s.year,
    }))
    // Tout est coché, sauf les épisodes spéciaux (rarement dans un coffret).
    if (!checkedSeasons.value.length) checkedSeasons.value = show.value.seasons.filter((s) => s.number > 0).map((s) => s.number)
    shows.value = null
    if (!name.value.trim() || name.value.trim() === baseName()) name.value = `${show.value.name} : l'intégrale`
  } catch {
    message.value = 'TMDB ne répond pas pour le moment : indique le nombre de saisons ci-dessous.'
  } finally {
    busy.value = false
  }
}
function toggleSeason(n: number, on: boolean) {
  checkedSeasons.value = on ? [...new Set([...checkedSeasons.value, n])].sort((a, b) => a - b) : checkedSeasons.value.filter((x) => x !== n)
}

// ---------------------------------------------------------------- Résultat

const chosen = computed(() => films.value.filter((f) => f.checked))
const count = computed(() => (kind.value === 'films' ? chosen.value.length : checkedSeasons.value.length))

function done() {
  if (kind.value === 'serie') {
    const series = seriesName.value.trim() || baseName() || name.value.trim()
    const seasons = [...checkedSeasons.value].sort((a, b) => a - b)
    const years = seasonList.value.filter((s) => seasons.includes(s.number) && s.year).map((s) => s.year!)
    emit('done', {
      name: name.value.trim() || `${series} : l'intégrale`,
      saga: series,
      videoFormat: format.value,
      seasons,
      contents: seasons.map((n) => seasonContent(series, n)),
      genres: ['Série TV', ...(show.value?.genres ?? [])],
      year: years.length ? Math.min(...years) : show.value?.year,
      artist: show.value?.creator ?? 'Créateurs divers',
      artistSort: show.value?.creator ?? 'Divers',
      coverUrls: show.value?.posterUrl ? [show.value.posterUrl] : [],
    })
    return
  }
  const list = chosen.value
  const withYear = list.filter((f) => f.year)
  const director = list.find((f) => f.artist)
  // Réalisateur : le même pour tous les films trouvés, sinon « Réalisateurs divers ».
  const sameDirector = director && list.every((f) => !f.artist || f.artist === director.artist)
  emit('done', {
    name: name.value.trim() || saga.value?.name || 'Coffret',
    saga: saga.value?.name ?? (baseName() || undefined),
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
    <div class="row kinds" role="tablist" aria-label="Type de coffret">
      <button type="button" role="tab" class="chip" :class="{ active: kind === 'films' }" :aria-selected="kind === 'films'" @click="kind = 'films'">
        🎬 Films (saga)
      </button>
      <button type="button" role="tab" class="chip" :class="{ active: kind === 'serie' }" :aria-selected="kind === 'serie'" @click="kind = 'serie'">
        📺 Série TV (saisons)
      </button>
    </div>
    <label class="field">
      Nom du coffret
      <input
        v-model="name"
        :placeholder="kind === 'films' ? 'ex. Harry Potter : l\'intégrale' : 'ex. Friends : l\'intégrale'"
        autocomplete="off"
        @keydown.enter.prevent="kind === 'films' ? findSaga() : findShows()"
      />
    </label>
    <div class="row">
      <label class="field grow">
        Support
        <select v-model="format">
          <option v-for="(label, key) in VIDEO_FORMAT_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <template v-if="hasTmdbKey()">
        <button v-if="kind === 'films'" class="btn" type="button" :disabled="busy || !name.trim()" @click="findSaga">🎬 Films de la saga</button>
        <button v-else class="btn" type="button" :disabled="busy || !name.trim()" @click="findShows">📺 Chercher la série</button>
      </template>
    </div>
    <p v-if="!hasTmdbKey()" class="small muted">
      Avec une clé TMDB (Réglages), l'appli propose directement {{ kind === 'films' ? 'les films de la saga' : 'la série et ses saisons' }}.
    </p>
    <p v-if="message" class="small notice">{{ message }}</p>

    <!-- Films -->
    <template v-if="kind === 'films'">
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
    </template>

    <!-- Série -->
    <template v-else>
      <ul v-if="shows?.length" class="plain results">
        <li v-for="r in shows" :key="r.id">
          <button type="button" class="btn btn-small result" @click="chooseShow(r)">
            📺 {{ r.title }}<span v-if="r.year" class="muted"> ({{ r.year }})</span>
          </button>
        </li>
      </ul>
      <p v-if="show" class="small"><strong>{{ show.name }}</strong><span v-if="show.year" class="muted"> ({{ show.year }})</span> : coche les saisons qui sont dans ton coffret.</p>
      <label v-else class="field">
        Nom de la série
        <input v-model="seriesName" :placeholder="baseName() || 'ex. Friends'" autocomplete="off" />
      </label>
      <label v-if="!show" class="field">
        Nombre de saisons de la série
        <input :value="seasonCount || ''" inputmode="numeric" placeholder="ex. 10" @change="manualSeasons(Number(($event.target as HTMLInputElement).value))" />
      </label>
      <div v-if="seasonList.length" class="seasons">
        <label v-for="s in seasonList" :key="s.number" class="season" :class="{ on: checkedSeasons.includes(s.number) }">
          <input type="checkbox" :checked="checkedSeasons.includes(s.number)" @change="toggleSeason(s.number, ($event.target as HTMLInputElement).checked)" />
          {{ s.label }}<span v-if="s.year" class="muted small"> ({{ s.year }})</span>
        </label>
      </div>
    </template>

    <div class="row">
      <button class="btn" type="button" @click="emit('cancel')">Annuler</button>
      <button class="btn btn-primary grow" type="button" :disabled="!count" @click="done">
        {{ doneLabel ?? 'Continuer' }} ({{ count }} {{ kind === 'films' ? (count > 1 ? 'films' : 'film') : count > 1 ? 'saisons' : 'saison' }})
      </button>
    </div>
  </section>
</template>

<style scoped>
.kinds {
  gap: 6px;
}
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
.seasons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 4px;
}
.season {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--surface-2);
  opacity: 0.6;
}
.season.on {
  opacity: 1;
}
</style>
