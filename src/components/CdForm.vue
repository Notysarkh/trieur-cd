<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BookKind, CdDraft, CdFormat, MusicFormat, Platform, VideoFormat } from '../db/types'
import { MUSIC_FORMAT_LABELS, musicFormatInfo, musicSize } from '../lib/musicFormats'
import RatingInput from './RatingInput.vue'
import BoxSetBuilder, { type BoxSetResult } from './BoxSetBuilder.vue'
import { seasonContent } from '../lib/seasons'
import { BOOK_KIND_LABELS, FORMAT_LABELS } from '../lib/formats'
import { mediaOf } from '../lib/media'
import { guessSortName } from '../lib/sortName'
import { invertPersonName } from '../services/books'
import { VIDEO_FORMAT_LABELS, videoSize } from '../services/films'
import { rulesFor, settings } from '../services/settings'
import { gameSize } from '../services/games'
import PlatformSelect from './PlatformSelect.vue'

// Formulaire de fiche (CD ou livre), utilisé pour la saisie manuelle et pour la modification.
// Le formulaire modifie directement l'objet `model` qu'on lui passe.

const model = defineModel<CdDraft>({ required: true })
const isBook = computed(() => mediaOf(model.value) === 'livre')
const isVideo = computed(() => mediaOf(model.value) === 'video')
const isGame = computed(() => mediaOf(model.value) === 'jeu')

// Jeux : changer de console met à jour l'épaisseur et la hauteur du boîtier.
function setPlatform(platform: Platform | undefined) {
  model.value.platform = platform
  if (platform) Object.assign(model.value, gameSize(platform, model.value.discCount))
}

// Films : changer de support (DVD, Blu-ray, VHS…) ou de nombre de disques met à jour épaisseur et hauteur.
/** Coffret : choisir ses films depuis la recherche (saga TMDB + recherche par titre). */
const boxBuilder = ref(false)
function fromBoxSet(b: BoxSetResult) {
  boxBuilder.value = false
  model.value.contents = b.contents
  model.value.series ||= b.saga
  if (b.seasons?.length) setSeasons(b.seasons)
  if (!model.value.genres.length) model.value.genres = b.genres
  if (!model.value.coverUrls.length) model.value.coverUrls = b.coverUrls
}

// Coffret de série : les saisons qu'il contient (cases à cocher). La liste du coffret et sa place
// (celle de sa première saison) suivent.
const isSeriesBox = computed(() => !!model.value.boxSet && (!!model.value.seasons?.length || model.value.genres.includes('Série TV')))
const seasonMax = ref(Math.max(10, ...(model.value.seasons ?? [])))
function setSeasons(list: number[]) {
  const seasons = [...new Set(list)].sort((a, b) => a - b)
  const series = model.value.series?.trim() || model.value.title.replace(/\s*[,:\-–].*$/, '').trim()
  model.value.seasons = seasons.length ? seasons : undefined
  model.value.contents = seasons.length ? seasons.map((n) => seasonContent(series, n)) : undefined
  const first = seasons.filter((n) => n > 0)[0]
  model.value.volume = first
  seasonMax.value = Math.max(seasonMax.value, ...seasons)
}
function toggleSeason(n: number, on: boolean) {
  setSeasons(on ? [...(model.value.seasons ?? []), n] : (model.value.seasons ?? []).filter((x) => x !== n))
}

/** Coffret : une ligne par film (lignes vides ignorées). */
function setContents(text: string) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  model.value.contents = lines.length ? lines : undefined
}
function setVideo(format: VideoFormat, discCount = model.value.discCount) {
  model.value.videoFormat = format
  model.value.discCount = discCount
  Object.assign(model.value, videoSize(format, discCount))
}
const themes = computed(() => rulesFor(mediaOf(model.value)).themes)

// Le nom de tri suit le nom d'artiste (ou d'auteur : « Albert Camus » → « Camus, Albert »)…
// tant que tu ne l'as pas modifié toi-même.
const autoSort = (name: string) => (isBook.value || isVideo.value ? invertPersonName(name.split(/\s*&\s*/)[0] ?? name) : guessSortName(name))
if (!model.value.artistSort) model.value.artistSort = autoSort(model.value.artist)
const sortTouched = ref(model.value.artistSort !== '' && model.value.artistSort !== autoSort(model.value.artist))
watch(
  () => model.value.artist,
  (artist) => {
    if (!sortTouched.value) model.value.artistSort = autoSort(artist)
  },
)

// Livres : le type (BD, manga, comics) décide du thème ; on garde le genre en accord.
const KIND_GENRES: Record<BookKind, string | undefined> = { livre: undefined, bd: 'BD', manga: 'Manga', comics: 'Comics' }
function setKind(kind: BookKind) {
  model.value.bookKind = kind
  const kindGenres = Object.values(KIND_GENRES).filter(Boolean) as string[]
  const others = model.value.genres.filter((g) => !kindGenres.includes(g))
  model.value.genres = KIND_GENRES[kind] ? [KIND_GENRES[kind]!] : others
}

// Changer de format met à jour l'épaisseur par défaut.
function setFormat(format: CdFormat) {
  model.value.format = format
  model.value.thicknessMm = settings.thickness[format]
}

// Musique : le support (vinyle, cassette…) décide des dimensions ; CD et SA-CD : selon le conditionnement.
const cdCase = computed(() => musicFormatInfo(model.value.musicFormat).cdCase)
function setMusic(f: MusicFormat, discCount = model.value.discCount) {
  model.value.musicFormat = f === 'cd' ? undefined : f
  model.value.discCount = discCount
  const size = musicSize(f, discCount)
  if (size) Object.assign(model.value, size)
  else {
    model.value.thicknessMm = settings.thickness[model.value.format]
    model.value.heightCm = undefined
  }
}

// Compilation perso (CD gravé, mix…) : pas d'artiste, seulement un nom (le titre).
// Elle est rangée à la fin du thème choisi.
const PERSO = 'Compilation perso'
function setPersonal(on: boolean) {
  model.value.personalCompilation = on || undefined
  if (on) {
    model.value.artist = PERSO
    model.value.artistSort = PERSO
    model.value.isCompilation = false
  } else if (model.value.artist === PERSO) {
    model.value.artist = ''
    model.value.artistSort = ''
  }
}

/** Les genres/styles sont saisis sous forme de liste séparée par des virgules. */
function toList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
function toNumber(text: string): number | undefined {
  const n = Number(text.replace(',', '.'))
  return text.trim() && Number.isFinite(n) ? n : undefined
}
</script>

<template>
  <div class="form-grid">
    <div class="full row flags">
      <label class="row small">
        <input type="checkbox" :checked="!!model.noBarcode" @change="model.noBarcode = ($event.target as HTMLInputElement).checked || undefined" />
        {{ isBook ? 'Sans ISBN / code-barres' : 'Sans code-barres' }}
      </label>
      <label v-if="!isBook" class="row small">
        <input type="checkbox" :checked="!!model.noBox" @change="model.noBox = ($event.target as HTMLInputElement).checked || undefined" />
        Sans boîte (en vrac) : rangé à part
      </label>
      <label v-if="!isBook && !isVideo && !isGame" class="row small">
        <input type="checkbox" :checked="!!model.personalCompilation" @change="setPersonal(($event.target as HTMLInputElement).checked)" />
        Compilation perso (CD gravé, mix…)
      </label>
    </div>
    <div class="field full">
      Ma note
      <RatingInput v-model="model.rating" />
    </div>
    <label class="field">
      Ma valeur (€)
      <input
        :value="model.myValue ?? ''"
        inputmode="decimal"
        placeholder="estimation Discogs si vide"
        @change="model.myValue = toNumber(($event.target as HTMLInputElement).value)"
      />
    </label>
    <label class="field full">
      Thème
      <select :value="model.themeOverride ?? ''" @change="model.themeOverride = ($event.target as HTMLSelectElement).value || undefined">
        <option value="">{{ model.personalCompilation ? '— à choisir —' : isGame ? "Automatique (d'après la console)" : "Automatique (d'après les genres)" }}</option>
        <option v-for="t in themes" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <span v-if="model.personalCompilation" class="hint">Rangée à la fin de ce thème, par ordre alphabétique de son nom.</span>
      <span v-else-if="model.themeOverride && isVideo" class="hint">S'applique à ce film (ou à toutes les saisons de la série).</span>
      <span v-else-if="model.themeOverride && isBook" class="hint">
        S'applique à tous les livres de cet auteur (ou de cette série) : ils restent ensemble.
      </span>
      <span v-else-if="model.themeOverride" class="hint">S'applique à tous les CD de cet artiste (un artiste n'est jamais coupé en deux thèmes).</span>
    </label>

    <!-- Jeux vidéo -->
    <template v-if="isGame">
      <label class="field">
        Console
        <PlatformSelect :model-value="model.platform" @update:model-value="setPlatform" />
      </label>
      <label class="field">
        Nombre de disques
        <input :value="model.discCount" inputmode="numeric" @change="model.discCount = toNumber(($event.target as HTMLInputElement).value) ?? 1" />
      </label>
      <label class="field full">
        Titre
        <input v-model="model.title" required autocomplete="off" />
      </label>
      <label class="field">
        Éditeur
        <input v-model="model.artist" required autocomplete="off" @change="model.label = model.artist" />
      </label>
      <label class="field">
        Année
        <input :value="model.year ?? ''" inputmode="numeric" @input="model.year = toNumber(($event.target as HTMLInputElement).value)" />
      </label>
      <label class="field full">
        Genres (séparés par des virgules)
        <input :value="model.genres.join(', ')" autocomplete="off" @change="model.genres = toList(($event.target as HTMLInputElement).value)" />
      </label>
      <div class="row full">
        <label class="field grow">
          Hauteur (cm)
          <input :value="model.heightCm ?? ''" inputmode="decimal" @input="model.heightCm = toNumber(($event.target as HTMLInputElement).value)" />
        </label>
        <label class="field grow">
          Épaisseur (mm)
          <input
            :value="model.thicknessMm"
            inputmode="decimal"
            @input="model.thicknessMm = toNumber(($event.target as HTMLInputElement).value) ?? model.thicknessMm"
          />
        </label>
      </div>
      <label class="field">
        Code-barres
        <input v-model="model.barcode" inputmode="numeric" autocomplete="off" />
      </label>
      <label class="field full">
        Notes
        <textarea v-model="model.notes" rows="2"></textarea>
      </label>
    </template>

    <!-- Films -->
    <template v-else-if="isVideo">
      <label class="field">
        Support
        <select :value="model.videoFormat ?? 'dvd'" @change="setVideo(($event.target as HTMLSelectElement).value as VideoFormat)">
          <option v-for="(label, key) in VIDEO_FORMAT_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <label class="field">
        Disques ou cassettes
        <input
          :value="model.discCount"
          inputmode="numeric"
          @change="setVideo(model.videoFormat ?? 'dvd', toNumber(($event.target as HTMLInputElement).value) ?? 1)"
        />
      </label>
      <label class="field full">
        Titre
        <input v-model="model.title" required autocomplete="off" />
      </label>
      <label class="field">
        Saga ou série TV (restent ensemble)
        <input v-model="model.series" autocomplete="off" placeholder="ex. Harry Potter" />
      </label>
      <label class="field">
        N° dans la saga (ou saison)
        <input :value="model.volume ?? ''" inputmode="numeric" @input="model.volume = toNumber(($event.target as HTMLInputElement).value)" />
      </label>
      <label class="row small full">
        <input type="checkbox" :checked="!!model.boxSet" @change="model.boxSet = ($event.target as HTMLInputElement).checked || undefined" />
        Coffret (plusieurs films ou saisons dans une seule boîte)
      </label>
      <div v-if="isSeriesBox" class="field full">
        Saisons dans le coffret
        <div class="season-grid">
          <label v-for="n in seasonMax" :key="n" class="season-box" :class="{ on: model.seasons?.includes(n) }">
            <input type="checkbox" :checked="model.seasons?.includes(n)" @change="toggleSeason(n, ($event.target as HTMLInputElement).checked)" />
            {{ n }}
          </label>
          <button type="button" class="btn btn-small" @click="seasonMax += 1">+ saison</button>
        </div>
        <span class="hint">Le coffret se range à la place de sa première saison, avec les saisons achetées à part.</span>
      </div>
      <label v-if="model.boxSet && !isSeriesBox" class="field full">
        Films du coffret (un par ligne, dans l'ordre)
        <textarea
          :value="(model.contents ?? []).join('\n')"
          rows="5"
          placeholder="Harry Potter à l'école des sorciers&#10;Harry Potter et la chambre des secrets&#10;…"
          @change="setContents(($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <span class="hint">
          Le coffret est rangé comme un seul objet, en tête de sa saga. Chercher un de ces films trouve le coffret.
        </span>
      </label>
      <div v-if="model.boxSet" class="full">
        <button v-if="!boxBuilder" type="button" class="btn btn-small" @click="boxBuilder = true">
          🔎 {{ isSeriesBox ? 'Retrouver la série et ses saisons (TMDB)' : 'Choisir les films depuis la recherche' }}
        </button>
        <BoxSetBuilder
          v-else
          :initial-name="model.title"
          :initial-contents="model.contents"
          :initial-format="model.videoFormat"
          :initial-series="model.series"
          :initial-seasons="model.seasons"
          done-label="Mettre à jour la liste"
          @done="fromBoxSet"
          @cancel="boxBuilder = false"
        />
      </div>
      <label class="field">
        Réalisateur
        <input v-model="model.artist" required autocomplete="off" />
      </label>
      <label class="field">
        Année
        <input :value="model.year ?? ''" inputmode="numeric" @input="model.year = toNumber(($event.target as HTMLInputElement).value)" />
      </label>
      <label class="field">
        Éditeur
        <input v-model="model.label" autocomplete="off" />
      </label>
      <label class="field">
        Genres (séparés par des virgules)
        <input :value="model.genres.join(', ')" autocomplete="off" @change="model.genres = toList(($event.target as HTMLInputElement).value)" />
      </label>
      <div class="row full">
        <label class="field grow">
          Hauteur (cm)
          <input :value="model.heightCm ?? ''" inputmode="decimal" @input="model.heightCm = toNumber(($event.target as HTMLInputElement).value)" />
        </label>
        <label class="field grow">
          Épaisseur (mm)
          <input
            :value="model.thicknessMm"
            inputmode="decimal"
            @input="model.thicknessMm = toNumber(($event.target as HTMLInputElement).value) ?? model.thicknessMm"
          />
        </label>
      </div>
      <label class="field">
        Code-barres
        <input v-model="model.barcode" inputmode="numeric" autocomplete="off" />
      </label>
      <label class="field full">
        Notes
        <textarea v-model="model.notes" rows="2"></textarea>
      </label>
    </template>

    <!-- Livres / BD -->
    <template v-else-if="isBook">
      <label class="field">
        Type
        <select :value="model.bookKind ?? 'livre'" @change="setKind(($event.target as HTMLSelectElement).value as BookKind)">
          <option v-for="(label, key) in BOOK_KIND_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <label class="field">
        Auteur(s)
        <input v-model="model.artist" required autocomplete="off" />
      </label>
      <label class="field">
        Nom de tri (ex. « Camus, Albert »)
        <input v-model="model.artistSort" autocomplete="off" @input="sortTouched = true" />
      </label>
      <label class="field full">
        Titre
        <input v-model="model.title" required autocomplete="off" />
      </label>
      <label class="field">
        Série (BD, manga, saga…)
        <input v-model="model.series" autocomplete="off" />
      </label>
      <label class="field">
        Tome
        <input :value="model.volume ?? ''" inputmode="numeric" @input="model.volume = toNumber(($event.target as HTMLInputElement).value)" />
      </label>
      <label class="field">
        Année
        <input :value="model.year ?? ''" inputmode="numeric" @input="model.year = toNumber(($event.target as HTMLInputElement).value)" />
      </label>
      <label class="field">
        Éditeur
        <input v-model="model.label" autocomplete="off" />
      </label>
      <label class="field">
        Collection
        <input v-model="model.bookCollection" autocomplete="off" />
      </label>
      <label class="field">
        Genres (séparés par des virgules)
        <input :value="model.genres.join(', ')" autocomplete="off" @change="model.genres = toList(($event.target as HTMLInputElement).value)" />
      </label>
      <div class="row full">
        <label class="field grow">
          Pages
          <input :value="model.pages ?? ''" inputmode="numeric" @input="model.pages = toNumber(($event.target as HTMLInputElement).value)" />
        </label>
        <label class="field grow">
          Hauteur (cm)
          <input :value="model.heightCm ?? ''" inputmode="decimal" @input="model.heightCm = toNumber(($event.target as HTMLInputElement).value)" />
        </label>
        <label class="field grow">
          Épaisseur (mm)
          <input
            :value="model.thicknessMm"
            inputmode="decimal"
            @input="model.thicknessMm = toNumber(($event.target as HTMLInputElement).value) ?? model.thicknessMm"
          />
        </label>
      </div>
      <label class="field">
        ISBN / code-barres
        <input v-model="model.barcode" inputmode="numeric" autocomplete="off" />
      </label>
      <label class="field full">
        Notes
        <textarea v-model="model.notes" rows="2"></textarea>
      </label>
    </template>

    <template v-else>
    <template v-if="!model.personalCompilation">
      <label class="field">
        Artiste
        <input v-model="model.artist" required autocomplete="off" />
      </label>
      <label class="field">
        Nom de tri (ex. « Beatles, The », « Brassens, Georges »)
        <input v-model="model.artistSort" autocomplete="off" @input="sortTouched = true" />
      </label>
    </template>
    <label class="field full">
      {{ model.personalCompilation ? 'Nom de la compilation' : "Titre de l'album" }}
      <input v-model="model.title" required autocomplete="off" />
    </label>
    <label class="field">
      Année de sortie de l'album
      <input
        :value="model.year ?? ''"
        inputmode="numeric"
        @input="model.year = toNumber(($event.target as HTMLInputElement).value)"
      />
    </label>
    <label class="field">
      Label
      <input v-model="model.label" autocomplete="off" />
    </label>
    <label class="field">
      Genres (séparés par des virgules)
      <input
        :value="model.genres.join(', ')"
        autocomplete="off"
        @change="model.genres = toList(($event.target as HTMLInputElement).value)"
      />
    </label>
    <label class="field">
      Styles (séparés par des virgules)
      <input
        :value="model.styles.join(', ')"
        autocomplete="off"
        @change="model.styles = toList(($event.target as HTMLInputElement).value)"
      />
    </label>
    <label class="field">
      Support
      <select :value="model.musicFormat ?? 'cd'" @change="setMusic(($event.target as HTMLSelectElement).value as MusicFormat)">
        <option v-for="(label, key) in MUSIC_FORMAT_LABELS" :key="key" :value="key">{{ label }}</option>
      </select>
    </label>
    <label v-if="cdCase" class="field">
      Boîtier
      <select :value="model.format" @change="setFormat(($event.target as HTMLSelectElement).value as CdFormat)">
        <option v-for="(label, key) in FORMAT_LABELS" :key="key" :value="key">{{ label }}</option>
      </select>
    </label>
    <label v-else class="field">
      Hauteur (cm)
      <input :value="model.heightCm ?? ''" inputmode="decimal" @input="model.heightCm = toNumber(($event.target as HTMLInputElement).value)" />
    </label>
    <div class="row">
      <label class="field grow">
        {{ model.musicFormat === 'cassette' ? 'Nombre de cassettes' : 'Nombre de disques' }}
        <input
          :value="model.discCount"
          inputmode="numeric"
          @input="cdCase ? (model.discCount = toNumber(($event.target as HTMLInputElement).value) ?? 1) : setMusic(model.musicFormat ?? 'cd', toNumber(($event.target as HTMLInputElement).value) ?? 1)"
        />
      </label>
      <label class="field grow">
        Épaisseur (mm)
        <input
          :value="model.thicknessMm"
          inputmode="decimal"
          @input="model.thicknessMm = toNumber(($event.target as HTMLInputElement).value) ?? model.thicknessMm"
        />
      </label>
    </div>
    <label class="field">
      Compositeur (classique : sert au tri)
      <input v-model="model.composer" autocomplete="off" placeholder="ex. Bach, Johann Sebastian" />
    </label>
    <label class="field">
      Code-barres
      <input v-model="model.barcode" inputmode="numeric" autocomplete="off" />
    </label>
    <label class="row small compil">
      <input v-model="model.isCompilation" type="checkbox" />
      Compilation multi-artistes
    </label>
    <label class="field full">
      Notes
      <textarea v-model="model.notes" rows="2"></textarea>
    </label>
    </template>
  </div>
</template>

<style scoped>
.flags {
  gap: 16px;
}
.hint {
  font-size: 0.8rem;
}
.compil {
  align-self: end;
  min-height: 44px;
}
.season-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.season-box {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 8px;
  background: var(--surface-2);
  opacity: 0.6;
  font-weight: 400;
}
.season-box.on {
  opacity: 1;
  font-weight: 600;
}
</style>
