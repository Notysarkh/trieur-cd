<script setup lang="ts">
import { computed, ref } from 'vue'
import { buildPlan, UNCLASSIFIED_THEME } from '../classification/engine'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db, itemsOf } from '../db/database'
import type { ArtistInfo, Cd } from '../db/types'
import { withoutBarcode } from '../services/collection'
import { inShelfOrder } from '../services/layout'
import { settings } from '../services/settings'

// Liste imprimable des CD sans code-barres, dans l'ordre du rangement, avec une case à cocher par CD.
// « Imprimer » ouvre la fenêtre d'impression : choisis « Enregistrer au format PDF » pour un fichier.

const all = useLiveQuery(() => itemsOf('cd'), [] as Cd[])
const artistInfos = useLiveQuery(
  async () => new Map((await db.artists.toArray()).map((a) => [a.mbArtistId, a])),
  new Map<string, ArtistInfo>(),
)
const plan = computed(() => buildPlan(all.value, settings.classification, artistInfos.value))
const includeShelved = ref(false)

const entries = computed(() =>
  inShelfOrder(
    all.value.filter((cd) => withoutBarcode(cd) && (includeShelved.value || !cd.shelvedAt)),
    all.value,
    plan.value,
  ),
)
const themeOf = (cd: Cd) => {
  // CD pas encore placé : le thème du classement actuel (son thème appliqué a pu changer depuis).
  const id = (!cd.location && plan.value.placement.get(cd.id)?.themeId) || cd.themeId || plan.value.placement.get(cd.id)?.themeId
  return (id && settings.classification.themes.find((t) => t.id === id)) || UNCLASSIFIED_THEME
}
const print = () => window.print()
const today = new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' })
</script>

<template>
  <main class="page">
    <div class="no-print stack controls">
      <RouterLink to="/sans-code" class="small">← Retour aux CD sans code-barres</RouterLink>
      <div class="row">
        <button class="btn btn-primary" @click="print">🖨️ Imprimer / enregistrer en PDF</button>
        <label class="row small"><input v-model="includeShelved" type="checkbox" /> Inclure les CD déjà rangés</label>
      </div>
    </div>

    <h1>CD sans code-barres à ranger</h1>
    <p class="small">{{ entries.length }} CD, dans l'ordre du rangement · {{ today }}</p>

    <table class="list">
      <thead>
        <tr>
          <th>✓</th>
          <th>N°</th>
          <th>Artiste — titre</th>
          <th>Thème</th>
          <th>Emplacement</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(e, i) in entries" :key="e.cd.id">
          <td class="box">{{ e.cd.shelvedAt ? '☑' : '☐' }}</td>
          <td>{{ i + 1 }}</td>
          <td>
            <strong>{{ e.cd.personalCompilation || e.cd.isCompilation ? e.cd.title : e.cd.artist }}</strong>
            <template v-if="!e.cd.personalCompilation && !e.cd.isCompilation"> — {{ e.cd.title }}</template>
          </td>
          <td><span class="dot" :style="{ background: themeOf(e.cd).color }"></span>{{ themeOf(e.cd).name }}</td>
          <td>{{ e.slotLabel ? `${e.slotLabel} · n° ${e.position}` : '—' }}</td>
        </tr>
      </tbody>
    </table>
  </main>
</template>

<style scoped>
.controls {
  margin-bottom: 16px;
}
h1 {
  margin-bottom: 0;
}
.list {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.list th,
.list td {
  border-bottom: 1px solid var(--border);
  padding: 5px 6px;
  text-align: left;
  vertical-align: top;
}
.box {
  font-size: 1.2rem;
  line-height: 1;
}
.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 4px;
}
@media print {
  .list {
    font-size: 9pt;
  }
  .list tr {
    break-inside: avoid;
  }
}
</style>
