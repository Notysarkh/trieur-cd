<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CdForm from '../components/CdForm.vue'
import CoverImage from '../components/CoverImage.vue'
import PhotoCapture from '../components/PhotoCapture.vue'
import { db } from '../db/database'
import type { Candidate, CdDraft, Platform } from '../db/types'
import { FORMAT_LABELS } from '../lib/formats'
import { addCd, updateCd } from '../services/collection'
import { hasDiscogsToken } from '../services/discogs'
import { enrichCandidate, searchByText } from '../services/identify'
import { removeScan } from '../services/scanQueue'
import { currentMedia, settings } from '../services/settings'
import { isIsbn, searchBooks } from '../services/books'
import { searchFilms, videoSize } from '../services/films'
import { hasTmdbKey } from '../services/tmdb'
import { gameSize, searchGames } from '../services/games'
import { hasRawgKey } from '../services/rawg'
import { platformLabel } from '../lib/platforms'
import PlatformSelect from '../components/PlatformSelect.vue'
import BoxSetBuilder, { type BoxSetResult } from '../components/BoxSetBuilder.vue'
import { canonicalBarcode } from '../lib/barcode'
import { mediaOf, type MediaKind } from '../lib/media'

// Plan B quand le code-barres ne suffit pas :
// 1) photo de la pochette (facultatif, aide-mémoire) ;
// 2) recherche par artiste + titre (livres : titre + auteur dans le catalogue de la BnF), avec choix ;
// 3) en dernier recours, saisie manuelle.
//
// Paramètres possibles dans l'adresse :
//   code = code-barres déjà connu ; scan = élément de la file à retirer une fois enregistré ;
//   cd = CD de la collection à corriger (au lieu d'en créer un nouveau).

const route = useRoute()
const router = useRouter()
const barcode = typeof route.query.code === 'string' ? route.query.code : undefined
const scanId = typeof route.query.scan === 'string' ? route.query.scan : undefined
const cdId = typeof route.query.cd === 'string' ? route.query.cd : undefined
/** CD ou livre : celui de la fiche à corriger, sinon un ISBN est un livre, sinon l'univers en cours. */
const media = ref<MediaKind>(barcode && isIsbn(barcode) ? 'livre' : currentMedia())
// (un film choisi après un code-barres inconnu reste un film : l'univers en cours est « Films »)
const isBook = computed(() => media.value === 'livre')
const isVideo = computed(() => media.value === 'video')
const isGame = computed(() => media.value === 'jeu')
/** Jeux : console cherchée (par défaut celle de l'écran Scanner). */
const platform = ref<Platform | undefined>(settings.scanPlatform || undefined)

const photo = ref<string>()
const artist = ref('')
const title = ref('')
const searching = ref(false)
const searchError = ref('')
const results = ref<Candidate[] | null>(null)
const searchWarnings = ref<string[]>([])

// Si on corrige un CD existant, on pré-remplit la recherche avec ce qu'on sait déjà.
if (cdId) {
  void db.cds.get(cdId).then((cd) => {
    if (!cd) return
    media.value = mediaOf(cd)
    if (cd.artist !== 'Inconnu') artist.value = cd.artist
    if (!cd.title.startsWith('Code ') && !cd.title.startsWith('ISBN ')) title.value = cd.title
    if (media.value === 'video' || media.value === 'jeu') artist.value = ''
    if (cd.platform) platform.value = cd.platform
    photo.value = cd.coverPhoto
  })
}


async function search() {
  if (!artist.value.trim() && !title.value.trim()) return
  searching.value = true
  searchError.value = ''
  searchWarnings.value = []
  try {
    if (isBook.value) {
      results.value = await searchBooks(title.value, artist.value)
    } else if (isVideo.value) {
      results.value = await searchFilms(title.value)
    } else if (isGame.value) {
      results.value = await searchGames(title.value, platform.value)
    } else {
      const found = await searchByText(artist.value, title.value)
      results.value = found.candidates
      searchWarnings.value = found.warnings
    }
  } catch (e) {
    searchError.value = e instanceof Error ? e.message : 'Recherche impossible.'
  } finally {
    searching.value = false
  }
}

// Fiche en cours d'édition (après un choix ou pour la saisie manuelle)
const draft = ref<CdDraft | null>(null)
const picking = ref<string>()

async function pick(c: Candidate) {
  picking.value = c.key
  const full = c.enriched ? c : await enrichCandidate(c, 'high').catch(() => c)
  picking.value = undefined
  // Jeu sans console connue : celle choisie pour la recherche.
  const chosenPlatform = isGame.value && !full.draft.platform && platform.value ? { platform: platform.value, ...gameSize(platform.value, full.draft.discCount) } : {}
  draft.value = {
    ...full.draft,
    ...chosenPlatform,
    barcode: barcode ?? full.draft.barcode,
    noBarcode: !(barcode ?? full.draft.barcode) || undefined,
    coverPhoto: photo.value,
    status: 'identifie',
    confidence: 85,
    confidenceReasons: [
      isBook.value ? 'Choisi par toi dans le catalogue de la BnF' : isVideo.value || isGame.value ? 'Choisi par toi après une recherche par titre' : 'Choisi par toi après une recherche texte',
    ],
  }
  window.scrollTo(0, 0)
}

function manual() {
  draft.value = {
    ...(isBook.value ? { media: 'livre' as const, bookKind: 'livre' as const, heightCm: 20 } : {}),
    ...(isVideo.value ? { media: 'video' as const, videoFormat: 'dvd' as const } : {}),
    ...(isGame.value ? { media: 'jeu' as const, platform: platform.value } : {}),
    barcode,
    artist: isVideo.value ? 'Réalisateur inconnu' : isGame.value ? 'Éditeur inconnu' : artist.value.trim(),
    artistSort: '',
    title: title.value.trim(),
    genres: [],
    styles: [],
    format: isBook.value || isVideo.value || isGame.value ? 'autre' : 'standard',
    discCount: 1,
    thicknessMm: isBook.value ? 25 : settings.thickness.standard,
    ...(isVideo.value ? videoSize('dvd', 1) : {}),
    ...(isGame.value ? gameSize(platform.value, 1) : {}),
    coverUrls: [],
    coverPhoto: photo.value,
    isCompilation: false,
    status: 'manuel',
    confidence: 100,
    confidenceReasons: ['Saisi à la main'],
    noBarcode: !barcode || undefined,
    source: 'manuel',
  }
  window.scrollTo(0, 0)
}

// --- Coffret de films : une seule fiche, films choisis depuis la recherche ---
const boxBuilder = ref(false)
function fromBoxSet(b: BoxSetResult) {
  boxBuilder.value = false
  draft.value = {
    media: 'video',
    videoFormat: b.videoFormat,
    boxSet: true,
    contents: b.contents,
    series: b.saga,
    barcode: barcode ? canonicalBarcode(barcode) : undefined,
    noBarcode: !barcode || undefined,
    artist: b.artist,
    artistSort: b.artistSort,
    title: b.name,
    year: b.year,
    genres: b.genres,
    styles: [],
    format: 'autre',
    discCount: b.contents.length,
    ...videoSize(b.videoFormat, b.contents.length),
    coverUrls: b.coverUrls,
    coverPhoto: photo.value,
    isCompilation: false,
    status: 'identifie',
    confidence: 90,
    confidenceReasons: ['Coffret créé par toi depuis la recherche'],
    source: 'manuel',
  }
  window.scrollTo(0, 0)
}

const canSave = computed(() => !!draft.value?.artist.trim() && !!draft.value?.title.trim())

async function save() {
  if (!draft.value || !canSave.value) return
  let id = cdId
  if (cdId) await updateCd(cdId, draft.value)
  else id = await addCd(draft.value)
  if (scanId) {
    await removeScan(scanId)
    await router.push('/scan')
  } else {
    await router.push({ name: 'cd', params: { id } })
  }
}
</script>

<template>
  <main class="page stack">
    <h1 v-if="isGame">{{ cdId ? 'Corriger un jeu' : 'Ajouter un jeu par son titre' }}</h1>
    <h1 v-else-if="isVideo">{{ cdId ? 'Corriger un film' : 'Ajouter un film par son titre' }}</h1>
    <h1 v-else-if="isBook">{{ cdId ? 'Corriger un livre' : 'Ajouter un livre sans ISBN' }}</h1>
    <h1 v-else>{{ cdId ? 'Corriger un CD' : 'Ajouter un CD sans code-barres' }}</h1>
    <p v-if="barcode" class="muted small">{{ isBook ? 'ISBN' : 'Code-barres' }} : {{ barcode }}</p>

    <BoxSetBuilder v-if="boxBuilder && !draft" @done="fromBoxSet" @cancel="boxBuilder = false" />

    <template v-if="!draft && !boxBuilder">
      <section v-if="isVideo && !cdId" class="card stack">
        <h2>📦 Un coffret ?</h2>
        <p class="muted small">Plusieurs films dans une seule boîte : une seule fiche, avec les films choisis depuis la recherche.</p>
        <button class="btn" @click="boxBuilder = true">📦 Créer un coffret</button>
      </section>
      <section class="card stack">
        <h2>1. Photo {{ isBook ? 'de la couverture' : isVideo ? 'de la jaquette' : isGame ? 'de la boîte' : 'de la pochette' }} (facultatif)</h2>
        <p class="muted small">Elle te servira de repère et remplacera la pochette si aucune n'est trouvée en ligne.</p>
        <CoverImage v-if="photo" :photo="photo" :size="96" label="Photo" />
        <PhotoCapture :has-photo="!!photo" @photo="photo = $event" />
      </section>

      <section class="card stack">
        <h2>2. Rechercher par {{ isBook ? 'titre et auteur' : isVideo ? 'titre' : isGame ? 'titre et console' : 'artiste et titre' }}</h2>
        <p v-if="isVideo" class="muted small">
          <template v-if="hasTmdbKey()">Sur TMDB (affiches, films du monde entier) et dans le catalogue de la BnF.</template>
          <template v-else>
            Dans le catalogue de la BnF. Ajoute ta clé TMDB dans les <RouterLink to="/reglages">Réglages</RouterLink> pour
            chercher aussi sur TMDB (affiches, films étrangers).
          </template>
        </p>
        <p v-if="isGame" class="muted small">
          <template v-if="hasRawgKey()">Sur RAWG (images, jeux du monde entier) et dans le catalogue de la BnF.</template>
          <template v-else>
            Dans le catalogue de la BnF (jeux édités en France). Ajoute ta clé RAWG dans les
            <RouterLink to="/reglages">Réglages</RouterLink> pour chercher aussi sur RAWG (images, jeux importés).
          </template>
        </p>
        <p v-if="isBook" class="muted small">
          Dans le catalogue de la BnF (tout ce qui a été publié en France, même les livres anciens sans ISBN). Quelques
          mots du titre suffisent ; ajoute le nom de l'auteur s'il y a trop de résultats.
        </p>
        <form class="stack" @submit.prevent="search">
          <template v-if="isGame">
            <label class="field">Titre du jeu <input v-model="title" autocomplete="off" /></label>
            <label class="field">Console <PlatformSelect v-model="platform" empty-label="Toutes les consoles" /></label>
          </template>
          <template v-else-if="isVideo">
            <label class="field">Titre du film ou de la série <input v-model="title" autocomplete="off" /></label>
          </template>
          <template v-else-if="isBook">
            <label class="field">Titre <input v-model="title" autocomplete="off" /></label>
            <label class="field">Auteur (nom de famille) <input v-model="artist" autocomplete="off" /></label>
          </template>
          <template v-else>
            <label class="field">Artiste <input v-model="artist" autocomplete="off" /></label>
            <label class="field">Titre de l'album <input v-model="title" autocomplete="off" /></label>
          </template>
          <button class="btn btn-primary" type="submit" :disabled="searching">
            {{ searching ? 'Recherche…' : '🔎 Rechercher' }}
          </button>
        </form>
        <p v-if="!isBook && !isVideo && !isGame && !hasDiscogsToken()" class="muted small">Recherche sur MusicBrainz uniquement (Discogs non configuré).</p>
        <p v-if="searchError" class="notice notice-danger">{{ searchError }} Réessaie dans quelques secondes.</p>
        <p v-for="w in searchWarnings" :key="w" class="notice notice-warn small">{{ w }} Résultats partiels.</p>

        <template v-if="results">
          <p v-if="!results.length" class="notice">Aucun résultat. Essaie avec moins de mots, ou passe à la saisie manuelle.</p>
          <ul class="cd-list">
            <li v-for="c in results" :key="c.key">
              <button class="cd-row result" :disabled="!!picking" @click="pick(c)">
                <CoverImage :urls="c.draft.coverUrls" :label="c.draft.title" />
                <span class="grow">
                  <span class="title">{{ c.draft.title }}</span><br />
                  <span class="artist">
                    <template v-if="c.draft.media === 'jeu'">{{ c.draft.platform ? platformLabel(c.draft.platform) : 'Console ?' }} · </template>
                    {{ c.draft.artist }}<template v-if="c.draft.year"> · {{ c.draft.year }}</template>
                    <template v-if="c.draft.label && c.draft.media === 'livre'"> · {{ c.draft.label }}</template>
                    <template v-if="c.draft.genres.length"> · {{ c.draft.genres.join(', ') }}</template>
                  </span>
                </span>
                <span class="badge badge-info">
                  {{
                    picking === c.key
                      ? '…'
                      : c.key.startsWith('bnf')
                        ? 'BnF'
                        : c.key.startsWith('tmdb')
                          ? 'TMDB'
                          : c.key.startsWith('rawg')
                            ? 'RAWG'
                          : c.key.startsWith('mb')
                            ? 'MusicBrainz'
                            : 'Discogs'
                  }}
                </span>
              </button>
            </li>
          </ul>
        </template>
      </section>

      <section class="card stack">
        <h2>3. Pas trouvé ?</h2>
        <button class="btn" @click="manual">✏️ Saisir à la main</button>
      </section>
    </template>

    <template v-else-if="draft">
      <div class="row">
        <CoverImage :urls="draft.coverUrls" :photo="draft.coverPhoto" :label="draft.title" :size="96" />
        <p class="muted small grow">
          Vérifie et complète la fiche, puis enregistre.<br />
          <template v-if="isGame">Vérifie la console : elle décide de la place du jeu.</template>
          <template v-else-if="isVideo">Vérifie le support (DVD, Blu-ray, VHS…) et le nombre de disques ou de cassettes : ils décident de la place occupée.</template>
          <template v-else-if="isBook">Épaisseur estimée d'après le nombre de pages : corrige-la si tu l'as mesurée.</template>
          <template v-else>Format : {{ FORMAT_LABELS[draft.format] }} (par défaut si inconnu — corrige si besoin).</template>
        </p>
      </div>
      <CdForm v-model="draft" />
      <div class="row">
        <button class="btn" @click="draft = null">← Retour</button>
        <button class="btn btn-primary grow" :disabled="!canSave" @click="save">Enregistrer</button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.result {
  width: 100%;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
</style>
