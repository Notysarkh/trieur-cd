<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CdForm from '../components/CdForm.vue'
import CoverImage from '../components/CoverImage.vue'
import PhotoCapture from '../components/PhotoCapture.vue'
import { db } from '../db/database'
import type { Candidate, CdDraft } from '../db/types'
import { FORMAT_LABELS } from '../lib/formats'
import { addCd, updateCd } from '../services/collection'
import { hasDiscogsToken } from '../services/discogs'
import { enrichCandidate, searchByText } from '../services/identify'
import { removeScan } from '../services/scanQueue'
import { settings } from '../services/settings'

// Plan B quand le code-barres ne suffit pas :
// 1) photo de la pochette (facultatif, aide-mémoire) ;
// 2) recherche par artiste + titre, avec choix parmi les propositions ;
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
    if (cd.artist !== 'Inconnu') artist.value = cd.artist
    if (!cd.title.startsWith('Code ')) title.value = cd.title
    photo.value = cd.coverPhoto
  })
}


async function search() {
  if (!artist.value.trim() && !title.value.trim()) return
  searching.value = true
  searchError.value = ''
  searchWarnings.value = []
  try {
    const found = await searchByText(artist.value, title.value)
    results.value = found.candidates
    searchWarnings.value = found.warnings
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
  const full = await enrichCandidate(c, 'high').catch(() => c)
  picking.value = undefined
  draft.value = {
    ...full.draft,
    barcode: barcode ?? full.draft.barcode,
    coverPhoto: photo.value,
    status: 'identifie',
    confidence: 85,
    confidenceReasons: ['Choisi par toi après une recherche texte'],
  }
  window.scrollTo(0, 0)
}

function manual() {
  draft.value = {
    barcode,
    artist: artist.value.trim(),
    artistSort: '',
    title: title.value.trim(),
    genres: [],
    styles: [],
    format: 'standard',
    discCount: 1,
    thicknessMm: settings.thickness.standard,
    coverUrls: [],
    coverPhoto: photo.value,
    isCompilation: false,
    status: 'manuel',
    confidence: 100,
    confidenceReasons: ['Saisi à la main'],
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
    <h1>{{ cdId ? 'Corriger un CD' : 'Ajouter un CD sans code-barres' }}</h1>
    <p v-if="barcode" class="muted small">Code-barres : {{ barcode }}</p>

    <template v-if="!draft">
      <section class="card stack">
        <h2>1. Photo de la pochette (facultatif)</h2>
        <p class="muted small">Elle te servira de repère et remplacera la pochette si aucune n'est trouvée en ligne.</p>
        <CoverImage v-if="photo" :photo="photo" :size="96" label="Photo" />
        <PhotoCapture :has-photo="!!photo" @photo="photo = $event" />
      </section>

      <section class="card stack">
        <h2>2. Rechercher par artiste et titre</h2>
        <form class="stack" @submit.prevent="search">
          <label class="field">Artiste <input v-model="artist" autocomplete="off" /></label>
          <label class="field">Titre de l'album <input v-model="title" autocomplete="off" /></label>
          <button class="btn btn-primary" type="submit" :disabled="searching">
            {{ searching ? 'Recherche…' : '🔎 Rechercher' }}
          </button>
        </form>
        <p v-if="!hasDiscogsToken()" class="muted small">Recherche sur MusicBrainz uniquement (Discogs non configuré).</p>
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
                    {{ c.draft.artist }}<template v-if="c.draft.year"> · {{ c.draft.year }}</template>
                    <template v-if="c.draft.genres.length"> · {{ c.draft.genres.join(', ') }}</template>
                  </span>
                </span>
                <span class="badge badge-info">{{ picking === c.key ? '…' : c.key.startsWith('mb') ? 'MusicBrainz' : 'Discogs' }}</span>
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

    <template v-else>
      <div class="row">
        <CoverImage :urls="draft.coverUrls" :photo="draft.coverPhoto" :label="draft.title" :size="96" />
        <p class="muted small grow">
          Vérifie et complète la fiche, puis enregistre.<br />
          Format : {{ FORMAT_LABELS[draft.format] }} (par défaut si inconnu — corrige si besoin).
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
