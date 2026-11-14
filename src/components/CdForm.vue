<script setup lang="ts">
import { ref, watch } from 'vue'
import type { CdDraft, CdFormat } from '../db/types'
import { FORMAT_LABELS } from '../lib/formats'
import { guessSortName } from '../lib/sortName'
import { settings } from '../services/settings'

// Formulaire de fiche CD, utilisé pour la saisie manuelle et pour la modification.
// Le formulaire modifie directement l'objet `model` qu'on lui passe.

const model = defineModel<CdDraft>({ required: true })

// Le nom de tri suit le nom d'artiste… tant que tu ne l'as pas modifié toi-même.
if (!model.value.artistSort) model.value.artistSort = guessSortName(model.value.artist)
const sortTouched = ref(model.value.artistSort !== '' && model.value.artistSort !== guessSortName(model.value.artist))
watch(
  () => model.value.artist,
  (artist) => {
    if (!sortTouched.value) model.value.artistSort = guessSortName(artist)
  },
)

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
        Sans code-barres
      </label>
      <label class="row small">
        <input type="checkbox" :checked="!!model.personalCompilation" @change="setPersonal(($event.target as HTMLInputElement).checked)" />
        Compilation perso (CD gravé, mix…)
      </label>
    </div>
    <label class="field full">
      Thème
      <select :value="model.themeOverride ?? ''" @change="model.themeOverride = ($event.target as HTMLSelectElement).value || undefined">
        <option value="">{{ model.personalCompilation ? '— à choisir —' : "Automatique (d'après les genres)" }}</option>
        <option v-for="t in settings.classification.themes" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <span v-if="model.personalCompilation" class="hint">Rangée à la fin de ce thème, par ordre alphabétique de son nom.</span>
      <span v-else-if="model.themeOverride" class="hint">S'applique à tous les CD de cet artiste (un artiste n'est jamais coupé en deux thèmes).</span>
    </label>
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
