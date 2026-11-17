<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Candidate, MusicFormat, Platform, ScanItem, VideoFormat } from '../db/types'
import { MUSIC_FORMAT_LABELS } from '../lib/musicFormats'
import { BOOK_KIND_LABELS, FORMAT_LABELS } from '../lib/formats'
import { VIDEO_FORMAT_LABELS } from '../services/films'
import { CONFIDENCE_THRESHOLD } from '../services/identify'
import { chooseCandidate, finalDraft, isBookScan, isReady, removeScan, retryErrors, setInclude, setScanPlatform, setScanSupport, useSearchResult } from '../services/scanQueue'
import { searchBooks } from '../services/books'
import { searchFilms } from '../services/films'
import { searchGames } from '../services/games'
import { searchByText } from '../services/identify'
import { settings } from '../services/settings'
import { platformLabel } from '../lib/platforms'
import CoverImage from './CoverImage.vue'
import PlatformSelect from './PlatformSelect.vue'
import { hasAnthropicKey, readGamesFromPhoto } from '../services/vision'
import { photoToThumbnail } from '../lib/image'

// Un code-barres dans la file d'attente, avec son état et les actions possibles.

const props = defineProps<{
  item: ScanItem
  /** Albums (release groups) déjà présents dans la collection, pour signaler une autre édition. */
  ownedAlbums: Set<string>
}>()

// La fiche telle qu'elle sera ajoutée (tient compte de ton choix éventuel).
const draft = computed(() => finalDraft(props.item))

const stateInfo = computed(() => {
  switch (props.item.state) {
    case 'en_attente':
      return { cls: 'badge-info', text: 'En attente' }
    case 'recherche':
      return { cls: 'badge-info', text: 'Recherche…' }
    case 'trouve':
      if (!isReady(props.item)) return { cls: 'badge-info', text: 'Finalisation…' }
      return (draft.value?.confidence ?? 0) >= CONFIDENCE_THRESHOLD
        ? { cls: 'badge-ok', text: `Trouvé · ${draft.value?.confidence}%` }
        : { cls: 'badge-warn', text: `Douteux · ${draft.value?.confidence}%` }
    case 'a_choisir':
      return { cls: 'badge-warn', text: 'À choisir' }
    case 'introuvable':
      return { cls: 'badge-danger', text: 'Introuvable' }
    default:
      return { cls: 'badge-danger', text: 'Erreur' }
  }
})

// --- Code introuvable : recherche par titre directement dans la file ---
const media = computed(() => (isBookScan(props.item) ? 'livre' : (props.item.media ?? 'cd')))
const query = ref('')
/** Auteur (livres) ou artiste (CD). */
const who = ref('')
const searchPlatform = ref<Platform | undefined>(props.item.platform ?? (settings.scanPlatform || undefined))
/** Films et musique : le support (un film inconnu n'est pas forcément un DVD). */
const searchSupport = ref<string>(props.item.media === 'video' ? 'dvd' : 'cd')
const supportLabels = computed<Record<string, string>>(() => (media.value === 'video' ? VIDEO_FORMAT_LABELS : MUSIC_FORMAT_LABELS))
const hasSupport = computed(() => media.value === 'video' || media.value === 'cd')
const currentSupport = computed(() => (media.value === 'video' ? (draft.value?.videoFormat ?? 'dvd') : (draft.value?.musicFormat ?? 'cd')))
const results = ref<Candidate[] | null>(null)
const searching = ref(false)
const searchError = ref('')
const picking = ref('')

async function searchTitle() {
  if (!query.value.trim() && !who.value.trim()) return
  searching.value = true
  searchError.value = ''
  try {
    if (media.value === 'jeu') results.value = await searchGames(query.value, searchPlatform.value)
    else if (media.value === 'video') results.value = await searchFilms(query.value)
    else if (media.value === 'livre') results.value = await searchBooks(query.value, who.value)
    else results.value = (await searchByText(who.value, query.value)).candidates
  } catch (e) {
    searchError.value = e instanceof Error ? e.message : 'Recherche impossible pour le moment.'
  } finally {
    searching.value = false
  }
}
/** Jeu au code-barres inconnu : Claude lit la jaquette, puis la recherche se lance avec le titre lu. */
const readingPhoto = ref(false)
async function readCover(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  readingPhoto.value = true
  searchError.value = ''
  try {
    const [g] = await readGamesFromPhoto(await photoToThumbnail(file, 1568), searchPlatform.value)
    if (!g) {
      searchError.value = 'Aucun jeu reconnu sur la photo : tape le titre.'
      return
    }
    query.value = g.title
    if (g.platform) searchPlatform.value = g.platform
    await searchTitle()
  } catch (e) {
    searchError.value = e instanceof Error ? e.message : 'Lecture de la photo impossible.'
  } finally {
    readingPhoto.value = false
  }
}

async function pick(c: Candidate) {
  picking.value = c.key
  try {
    await useSearchResult(props.item.id, c, searchPlatform.value, hasSupport.value ? (searchSupport.value as VideoFormat | MusicFormat) : undefined)
    results.value = null
  } finally {
    picking.value = ''
  }
}
const sourceOf = (key: string) =>
  key.startsWith('rawg') ? 'RAWG' : key.startsWith('tmdb') ? 'TMDB' : key.startsWith('bnf') ? 'BnF' : key.startsWith('ol') ? 'Open Library' : key.startsWith('mb') ? 'MusicBrainz' : 'Discogs'
const placeholder = computed(() =>
  media.value === 'jeu' ? 'Titre du jeu' : media.value === 'video' ? 'Titre du film ou de la série' : media.value === 'livre' ? 'Titre du livre' : "Titre de l'album",
)

const otherEdition = computed(
  () =>
    !props.item.duplicateOfIds.length &&
    !!draft.value?.mbReleaseGroupId &&
    props.ownedAlbums.has(draft.value.mbReleaseGroupId),
)
</script>

<template>
  <li class="item card">
    <div class="row top">
      <input
        v-if="item.state === 'trouve'"
        type="checkbox"
        :checked="item.include"
        :aria-label="item.include ? 'Ne pas l’ajouter à la collection' : 'L’ajouter à la collection'"
        @change="setInclude(item.id, ($event.target as HTMLInputElement).checked)"
      />
      <CoverImage :urls="draft?.coverUrls" :label="draft?.title" :size="56" />
      <div class="grow">
        <div class="title">{{ draft?.title ?? `Code ${item.barcode}` }}</div>
        <div class="muted small">
          <template v-if="draft">
            {{ draft.artist }}<template v-if="draft.year"> · {{ draft.year }}</template>
            <template v-if="draft.media === 'jeu'"> · {{ draft.platform ? platformLabel(draft.platform) : 'Console ?' }}</template>
            <template v-else-if="draft.media === 'video'"> · {{ VIDEO_FORMAT_LABELS[draft.videoFormat ?? 'dvd'] }}<template v-if="draft.discCount > 1"> × {{ draft.discCount }}</template></template>
            <template v-else-if="draft.media === 'livre'"> · {{ BOOK_KIND_LABELS[draft.bookKind ?? 'livre'] }}<template v-if="draft.label"> · {{ draft.label }}</template></template>
            <template v-else> · {{ FORMAT_LABELS[draft.format] }}</template>
          </template>
          <template v-else>{{ item.barcode }}</template>
        </div>
      </div>
      <span class="badge" :class="stateInfo.cls">{{ stateInfo.text }}</span>
    </div>

    <p v-if="item.duplicateOfIds.length" class="notice notice-warn small">
      Déjà dans ta collection : il ne sera pas ajouté, sauf si tu coches la case (2e exemplaire).
    </p>
    <p v-else-if="otherEdition" class="notice small">Tu as déjà cet album dans une autre édition.</p>
    <label v-if="draft?.media === 'jeu' && (item.state === 'trouve' || item.state === 'a_choisir') && !draft.platform" class="field small">
      La BnF n'indique pas la console de ce jeu : laquelle ?
      <PlatformSelect :model-value="undefined" @update:model-value="$event && setScanPlatform(item.id, $event)" />
    </label>
    <label v-if="hasSupport && draft && (item.state === 'trouve' || item.state === 'a_choisir')" class="row small support">
      Support :
      <select :value="currentSupport" aria-label="Support" @change="setScanSupport(item.id, ($event.target as HTMLSelectElement).value as VideoFormat | MusicFormat)">
        <option v-for="(label, key) in supportLabels" :key="key" :value="key">{{ label }}</option>
      </select>
    </label>
    <p v-if="item.state === 'erreur'" class="notice notice-danger small">{{ item.error }}</p>
    <!-- Code introuvable : on cherche par le titre, sans quitter la file -->
    <form v-if="item.state === 'introuvable'" class="stack find" @submit.prevent="searchTitle">
      <p class="muted small">
        Code-barres inconnu (souvent une réédition ou un import). Cherche-le par son titre : le code-barres sera gardé.
      </p>
      <input v-model="query" type="search" :placeholder="placeholder" :aria-label="placeholder" autocomplete="off" enterkeyhint="search" />
      <div class="row">
        <input
          v-if="media === 'cd' || media === 'livre'"
          v-model="who"
          class="grow"
          :placeholder="media === 'cd' ? 'Artiste' : 'Auteur (facultatif)'"
          :aria-label="media === 'cd' ? 'Artiste' : 'Auteur'"
          autocomplete="off"
        />
        <PlatformSelect v-if="media === 'jeu'" v-model="searchPlatform" class="grow" empty-label="Toutes les consoles" />
        <select v-if="hasSupport" v-model="searchSupport" aria-label="Support" class="support-select">
          <option v-for="(label, key) in supportLabels" :key="key" :value="key">{{ label }}</option>
        </select>
        <button class="btn btn-small btn-primary" type="submit" :disabled="searching || (!query.trim() && !who.trim())">
          {{ searching ? 'Recherche…' : '🔎 Chercher' }}
        </button>
      </div>
      <label v-if="media === 'jeu' && hasAnthropicKey()" class="btn btn-small photo-btn">
        {{ readingPhoto ? 'Lecture de la jaquette…' : '📷 Lire la jaquette (photo)' }}
        <input type="file" accept="image/*" capture="environment" hidden :disabled="readingPhoto" @change="readCover" />
      </label>
      <p v-if="searchError" class="notice notice-danger small">{{ searchError }}</p>
      <p v-if="results && !results.length" class="small muted">Aucun résultat : essaie avec moins de mots, ou une autre console.</p>
      <div v-if="results?.length" class="choices">
        <button v-for="c in results.slice(0, 8)" :key="c.key" type="button" class="choice" :disabled="!!picking" @click="pick(c)">
          <CoverImage :urls="c.draft.coverUrls" :label="c.draft.title" :size="44" />
          <span class="grow">
            <strong>{{ c.draft.title }}</strong><br />
            <span class="muted small">
              <template v-if="c.draft.media === 'jeu'">{{ c.draft.platform ? platformLabel(c.draft.platform) : 'Console ?' }} · </template>
              {{ c.draft.artist }}<template v-if="c.draft.year"> · {{ c.draft.year }}</template>
            </span>
          </span>
          <span class="badge badge-info">{{ picking === c.key ? '…' : sourceOf(c.key) }}</span>
        </button>
      </div>
      <p class="small muted">Toujours rien ? Le bouton « Introuvables → À vérifier » (en haut de la file) le garde pour plus tard.</p>
    </form>

    <!-- Plusieurs albums possibles : tu choisis -->
    <fieldset v-if="item.state === 'a_choisir'" class="choices">
      <legend class="small muted">Plusieurs fiches portent ce code. Laquelle as-tu en main ?</legend>
      <button
        v-for="c in item.candidates"
        :key="c.key"
        class="choice"
        @click="chooseCandidate(item.id, c.key)"
      >
        <CoverImage :urls="c.draft.coverUrls" :label="c.draft.title" :size="44" />
        <span class="grow">
          <strong>{{ c.draft.title }}</strong><br />
          <span class="muted small">
            {{ c.draft.artist }}<template v-if="c.draft.year"> · {{ c.draft.year }}</template>
            <template v-if="c.draft.label"> · {{ c.draft.label }}</template>
          </span>
        </span>
      </button>
    </fieldset>

    <details v-if="draft && item.state === 'trouve'" class="small">
      <summary class="muted">Pourquoi {{ draft.confidence }}% ?</summary>
      <ul>
        <li v-for="r in draft.confidenceReasons" :key="r">{{ r }}</li>
      </ul>
      <p v-if="draft.genres.length || draft.styles.length" class="muted">
        Genres : {{ [...draft.genres, ...draft.styles].join(', ') }}
      </p>
    </details>

    <div class="row actions">
      <button v-if="item.state === 'erreur'" class="btn btn-small" @click="retryErrors()">Réessayer</button>
      <RouterLink
        v-if="item.state !== 'en_attente' && item.state !== 'recherche'"
        class="btn btn-small"
        :to="{ name: 'ajouter', query: { code: item.barcode, scan: item.id } }"
      >
        {{ item.state === 'introuvable' ? 'Recherche complète' : 'Chercher par texte' }}
      </RouterLink>
      <button class="btn btn-small btn-danger" @click="removeScan(item.id)">Retirer</button>
    </div>
  </li>
</template>

<style scoped>
.item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  list-style: none;
}
.top {
  flex-wrap: nowrap;
}
.title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notice {
  margin: 0;
  padding: 8px 10px;
}
.choices {
  border: 0;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.choice {
  display: flex;
  gap: 10px;
  align-items: center;
  text-align: left;
  font: inherit;
  color: inherit;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px;
  cursor: pointer;
}
.actions {
  justify-content: flex-end;
}
.support select {
  min-height: 32px;
  padding: 2px 6px;
}
.find {
  gap: 8px;
}
.find p {
  margin: 0;
}
details ul {
  margin: 4px 0;
  padding-left: 20px;
}
</style>
