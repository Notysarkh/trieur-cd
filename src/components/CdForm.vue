<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BookKind, CdDraft, CdFormat, Platform, VideoFormat } from '../db/types'
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

// Films : changer de support (DVD / Blu-ray) ou de nombre de disques met à jour épaisseur et hauteur.
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
      <label v-if="!isBook && !isVideo && !isGame" class="row small">
        <input type="checkbox" :checked="!!model.personalCompilation" @change="setPersonal(($event.target as HTMLInputElement).checked)" />
        Compilation perso (CD gravé, mix…)
      </label>
    </div>
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

    <!-- DVD / Blu-ray -->
    <template v-else-if="isVideo">
      <label class="field">
        Support
        <select :value="model.videoFormat ?? 'dvd'" @change="setVideo(($event.target as HTMLSelectElement).value as VideoFormat)">
          <option v-for="(label, key) in VIDEO_FORMAT_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <label class="field">
        Nombre de disques
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
        Série TV (les saisons restent ensemble)
        <input v-model="model.series" autocomplete="off" />
      </label>
      <label class="field">
        Saison
        <input :value="model.volume ?? ''" inputmode="numeric" @input="model.volume = toNumber(($event.target as HTMLInputElement).value)" />
      </label>
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
      Format
      <select :value="model.format" @change="setFormat(($event.target as HTMLSelectElement).value as CdFormat)">
        <option v-for="(label, key) in FORMAT_LABELS" :key="key" :value="key">{{ label }}</option>
      </select>
    </label>
    <div class="row">
      <label class="field grow">
        Nombre de disques
        <input
          :value="model.discCount"
          inputmode="numeric"
          @input="model.discCount = toNumber(($event.target as HTMLInputElement).value) ?? 1"
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
</style>
