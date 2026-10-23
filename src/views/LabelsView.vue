<script setup lang="ts">
import { computed, ref } from 'vue'
import { UNCLASSIFIED_THEME } from '../classification/engine'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db } from '../db/database'
import type { Cd } from '../db/types'
import { buildLabels, type LabelMode } from '../layout/labels'
import { settings } from '../services/settings'

// Étiquettes intercalaires imprimables : « Rock — A à D », d'après les emplacements enregistrés.
//
// Deux formats (HYPOTHÈSES, à adapter si besoin) :
// - « Étiquettes » 63,5 × 33,9 mm, 24 par page A4 (3 × 8, planches type Avery L7159), ou papier à découper ;
// - « Intercalaires » 12 × 14 cm, 2 par page : à coller sur du carton et glisser entre les CD,
//   le haut dépasse des boîtiers (12,5 cm de haut) et porte le texte.

const cds = useLiveQuery(() => db.cds.toArray(), [] as Cd[])
const mode = ref<LabelMode>('rangee')
const format = ref<'etiquette' | 'intercalaire'>('etiquette')
const showWhere = ref(true)

const themes = computed(() => new Map(settings.classification.themes.map((t) => [t.id, t])))
const labels = computed(() =>
  buildLabels(
    cds.value,
    settings.furniture,
    (cd) => (cd.themeId && themes.value.get(cd.themeId)) || UNCLASSIFIED_THEME,
    mode.value,
  ),
)
const print = () => window.print()

const MODES: Record<LabelMode, string> = {
  rangee: 'Une par thème et par rangée (ex. Rock — A à D)',
  lettre: 'Une par lettre dans chaque thème (ex. Rock — B)',
  theme: 'Une seule par thème (ex. Rock — A à Z)',
}
</script>

<template>
  <main class="page">
    <div class="no-print stack controls">
      <RouterLink to="/rangement" class="small">← Retour au rangement</RouterLink>
      <h1>Étiquettes intercalaires</h1>
      <div class="form-grid">
        <label class="field">
          Découpage
          <select v-model="mode">
            <option v-for="(label, key) in MODES" :key="key" :value="key">{{ label }}</option>
          </select>
        </label>
        <label class="field">
          Format
          <select v-model="format">
            <option value="etiquette">Étiquettes 63,5 × 33,9 mm (24 par page)</option>
            <option value="intercalaire">Intercalaires 12 × 14 cm (2 par page)</option>
          </select>
        </label>
      </div>
      <label class="row small"><input v-model="showWhere" type="checkbox" /> Indiquer l'emplacement sur l'étiquette</label>
      <div class="row">
        <button class="btn btn-primary" :disabled="!labels.length" @click="print">
          🖨️ Imprimer {{ labels.length }} étiquette(s) / PDF
        </button>
      </div>
      <p v-if="!labels.length" class="notice notice-warn">
        Aucun CD n'a encore d'emplacement : applique d'abord le rangement (onglet Rangement).
      </p>
      <p v-else class="small muted">
        Dans la fenêtre d'impression : format A4, échelle 100 % (« taille réelle »), marges « par défaut ».
      </p>
    </div>

    <div class="sheet" :class="format">
      <div v-for="(l, i) in labels" :key="i" class="label" :style="{ '--theme': l.theme.color }">
        <div class="band"></div>
        <div class="content">
          <div class="theme-name">{{ l.theme.name }}</div>
          <div class="range">{{ l.range }}</div>
          <div v-if="showWhere" class="where">{{ l.where }}</div>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.controls {
  margin-bottom: 16px;
}
.sheet {
  display: grid;
  gap: 2.5mm;
  justify-content: start;
  color: #000;
}
.sheet.etiquette {
  grid-template-columns: repeat(auto-fill, 63.5mm);
}
.sheet.intercalaire {
  grid-template-columns: repeat(auto-fill, 120mm);
}
.label {
  background: #fff;
  border: 1px dashed #999;
  border-radius: 2mm;
  overflow: hidden;
  display: flex;
  break-inside: avoid;
}
.etiquette .label {
  width: 63.5mm;
  height: 33.9mm;
}
.intercalaire .label {
  width: 120mm;
  height: 140mm;
  flex-direction: column;
}
.band {
  background: var(--theme);
  flex: none;
}
.etiquette .band {
  width: 5mm;
}
.intercalaire .band {
  height: 6mm;
}
.content {
  padding: 2mm 3mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}
.intercalaire .content {
  justify-content: flex-start;
  padding: 3mm 5mm;
}
.theme-name {
  font-weight: 700;
  font-size: 11pt;
  line-height: 1.1;
}
.range {
  font-size: 20pt;
  font-weight: 800;
  line-height: 1.15;
}
.intercalaire .theme-name {
  font-size: 16pt;
}
.intercalaire .range {
  font-size: 32pt;
}
.where {
  font-size: 6.5pt;
  color: #444;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.intercalaire .where {
  font-size: 9pt;
}
@media print {
  .sheet {
    page: etiquettes;
    gap: 0 2.5mm;
  }
  .label {
    border-color: #ccc;
  }
  .intercalaire.sheet {
    gap: 4mm;
  }
}
@page etiquettes {
  size: A4;
  margin: 12.9mm 7.2mm;
}
</style>
