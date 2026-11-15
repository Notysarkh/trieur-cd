<script setup lang="ts">
import { useMedia } from '../composables/useMedia'
import { rulesFor } from '../services/settings'
import { computed, ref } from 'vue'
import { buildPlan, UNCLASSIFIED_THEME } from '../classification/engine'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db, itemsOf } from '../db/database'
import type { ArtistInfo, Cd } from '../db/types'
import { withoutBarcode } from '../services/collection'
import { inShelfOrder } from '../services/layout'

// Liste imprimable des CD sans code-barres, dans l'ordre du rangement, avec une case à cocher par CD.
// « Imprimer » ouvre la fenêtre d'impression : choisis « Enregistrer au format PDF » pour un fichier.

const { media, w } = useMedia()
const all = useLiveQuery(() => itemsOf(media.value), [] as Cd[])
const artistInfos = useLiveQuery(
  async () => new Map((await db.artists.toArray()).map((a) => [a.mbArtistId, a])),
  new Map<string, ArtistInfo>(),
)
const plan = computed(() => buildPlan(all.value, rulesFor(media.value), artistInfos.value))
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
  return (id && rulesFor(media.value).themes.find((t) => t.id === id)) || UNCLASSIFIED_THEME
}
const print = () => window.print()
const today = new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' })
</script>

<template>
  <main class="page">
    <div class="no-print stack controls">
      <RouterLink to="/sans-code" class="small">← Retour aux {{ w.many }} sans code-barres</RouterLink>
      <div class="row">
        <button class="btn btn-primary" @click="print">🖨️ Imprimer / enregistrer en PDF</button>
        <label class="row small"><input v-model="includeShelved" type="checkbox" /> Inclure les {{ w.many }} déjà rangés</label>
      </div>
    </div>

    <h1>{{ w.many.charAt(0).toUpperCase() + w.many.slice(1) }} sans code-barres à ranger</h1>
    <p class="small">{{ entries.length }} {{ entries.length > 1 ? w.many : w.one }}, dans l'ordre du rangement · {{ today }}</p>

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
            <template v-if="media === 'cd'">
              <strong>{{ e.cd.personalCompilation || e.cd.isCompilation ? e.cd.title : e.cd.artist }}</strong>
              <template v-if="!e.cd.personalCompilation && !e.cd.isCompilation"> — {{ e.cd.title }}</template>
            </template>
            <template v-else><strong>{{ e.cd.title }}</strong> — {{ e.cd.artist }}</template>
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
