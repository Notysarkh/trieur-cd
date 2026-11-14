<script setup lang="ts">
import { computed, ref } from 'vue'
import { UNCLASSIFIED_THEME } from '../classification/engine'
import { useLiveQuery } from '../composables/useLiveQuery'
import { itemsOf } from '../db/database'
import type { Cd } from '../db/types'
import { buildSlots } from '../layout/furniture'
import { settings } from '../services/settings'

// Plan de rangement imprimable : meuble par meuble, rangée par rangée, la liste ordonnée des CD.
// Il s'appuie sur les emplacements ENREGISTRÉS (dernier rangement appliqué + CD insérés depuis).
// « Imprimer » ouvre la fenêtre d'impression du navigateur : choisis « Enregistrer en PDF » pour un PDF.

const cds = useLiveQuery(() => itemsOf('cd'), [] as Cd[])
const showYears = ref(true)
const pagePerFurniture = ref(true)

const themes = computed(() => new Map(settings.classification.themes.map((t) => [t.id, t])))
const themeOf = (cd: Cd) => (cd.themeId && themes.value.get(cd.themeId)) || UNCLASSIFIED_THEME

const slots = computed(() => buildSlots(settings.furniture))
const bySlot = computed(() => {
  const m = new Map<string, Cd[]>()
  for (const cd of cds.value) if (cd.location) m.set(cd.location.slotId, [...(m.get(cd.location.slotId) ?? []), cd])
  for (const list of m.values()) list.sort((a, b) => a.location!.position - b.location!.position)
  return m
})
const furnitureBlocks = computed(() =>
  settings.furniture.map((f) => ({
    furniture: f,
    rows: slots.value
      .filter((s) => s.furnitureId === f.id)
      .map((s) => ({ slot: s, cds: bySlot.value.get(s.id) ?? [] })),
  })),
)
const known = computed(() => new Set(slots.value.map((s) => s.id)))
const unplaced = computed(() => cds.value.filter((cd) => !cd.location || !known.value.has(cd.location.slotId)))
const placedCount = computed(() => cds.value.length - unplaced.value.length)

/** Thèmes présents dans une rangée (pour l'en-tête). */
const rowThemes = (list: Cd[]) => [...new Map(list.map((cd) => [themeOf(cd).id, themeOf(cd)])).values()]
const today = new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' })
const print = () => window.print()
</script>

<template>
  <main class="page print-plan">
    <div class="no-print stack controls">
      <RouterLink to="/rangement" class="small">← Retour au rangement</RouterLink>
      <div class="row">
        <button class="btn btn-primary" @click="print">🖨️ Imprimer / enregistrer en PDF</button>
        <label class="row small"><input v-model="showYears" type="checkbox" /> Années</label>
        <label class="row small"><input v-model="pagePerFurniture" type="checkbox" /> Une page par meuble</label>
      </div>
      <p class="small muted">
        Dans la fenêtre d'impression, choisis « Enregistrer au format PDF » comme imprimante pour obtenir un fichier.
      </p>
      <p v-if="!placedCount" class="notice notice-warn">
        Aucun CD n'a encore d'emplacement : applique d'abord le rangement (onglet Rangement).
      </p>
    </div>

    <header class="doc-head">
      <h1>Plan de rangement</h1>
      <p class="small">{{ placedCount }} CD rangés · {{ today }}</p>
    </header>

    <section
      v-for="(b, i) in furnitureBlocks"
      :key="b.furniture.id"
      class="furniture"
      :class="{ 'new-page': pagePerFurniture && i > 0 }"
    >
      <h2>{{ b.furniture.name }}</h2>
      <div class="rows">
        <article v-for="r in b.rows" :key="r.slot.id" class="row-block">
          <h3>
            {{ r.slot.label.replace(`${b.furniture.name} · `, '') }}
            <span class="small muted">· {{ r.cds.length }} CD</span>
          </h3>
          <p v-if="r.cds.length" class="themes small">
            <span v-for="t in rowThemes(r.cds)" :key="t.id" class="theme-chip">
              <span class="dot" :style="{ background: t.color }"></span>{{ t.name }}
            </span>
          </p>
          <ol v-if="r.cds.length" class="list">
            <li v-for="cd in r.cds" :key="cd.id">
              <strong>{{ cd.isCompilation ? cd.title : cd.artist }}</strong>
              <template v-if="!cd.isCompilation"> — {{ cd.title }}</template>
              <span v-if="showYears && cd.year" class="muted"> ({{ cd.year }})</span>
            </li>
          </ol>
          <p v-else class="small muted">(vide)</p>
        </article>
      </div>
    </section>

    <section v-if="unplaced.length && placedCount" class="furniture new-page">
      <h2>À ranger ({{ unplaced.length }})</h2>
      <p class="small muted">CD ajoutés depuis le dernier rangement : l'onglet Rangement indique où les glisser.</p>
      <ul class="list">
        <li v-for="cd in unplaced" :key="cd.id">{{ cd.artist }} — {{ cd.title }}</li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.controls {
  margin-bottom: 16px;
}
.doc-head h1 {
  margin-bottom: 0;
}
.doc-head p {
  margin: 2px 0 12px;
}
.furniture h2 {
  border-bottom: 2px solid var(--text);
  padding-bottom: 4px;
}
.rows {
  columns: 2 260px;
  column-gap: 24px;
}
.row-block {
  break-inside: avoid;
  margin-bottom: 14px;
}
.row-block h3 {
  font-size: 0.95rem;
  margin: 0 0 4px;
}
.themes {
  margin: 0 0 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.theme-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}
.list {
  margin: 0;
  padding-left: 26px;
  font-size: 0.8rem;
  line-height: 1.35;
}
@media print {
  .new-page {
    break-before: page;
  }
  .doc-head h1 {
    font-size: 18pt;
  }
  .list {
    font-size: 8.5pt;
  }
}
</style>
