<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { db } from '../db/database'
import { dgThrottle } from '../services/discogs'
import { mbThrottle } from '../services/musicbrainz'
import { perf } from '../services/perf'

// Diagnostic : mesures prises sur CET appareil, à copier et envoyer en cas de lenteur.

// Les files réseau ne sont pas « réactives » : on rafraîchit l'affichage chaque seconde.
const now = ref(Date.now())
const timer = setInterval(() => (now.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(timer))

const avg = (list: number[]) => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0)
const network = computed(() => {
  void now.value
  return {
    mb: { pending: mbThrottle.pending, avg: avg(mbThrottle.durations) },
    dg: { pending: dgThrottle.pending, avg: avg(dgThrottle.durations) },
  }
})

const dbTest = ref<{ count: number; readMs: number; writeMs: number } | null>(null)
async function testDb() {
  const t0 = performance.now()
  const count = (await db.cds.toArray()).length
  const t1 = performance.now()
  await db.settings.put({ key: 'diagnostic', value: Date.now() })
  const t2 = performance.now()
  dbTest.value = { count, readMs: Math.round(t1 - t0), writeMs: Math.round(t2 - t1) }
}

const device = computed(() => {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    ua: navigator.userAgent,
    cores: navigator.hardwareConcurrency ?? '?',
    memory: nav.deviceMemory ? `${nav.deviceMemory} Go` : '?',
    installed: matchMedia('(display-mode: standalone)').matches ? 'oui' : 'non',
  }
})

const minutes = computed(() => Math.max(1, Math.round((now.value - perf.startedAt) / 60000)))

/** Le diagnostic en texte, pour le copier-coller. */
const report = computed(() =>
  [
    `Mediamwa — diagnostic du ${new Date(now.value).toLocaleString('fr-FR')}`,
    `Appareil : ${device.value.ua}`,
    `Cœurs : ${device.value.cores} · mémoire : ${device.value.memory} · appli installée : ${device.value.installed}`,
    `Lecteur de codes-barres : ${perf.scanner.engine || 'pas encore utilisé'} · ${perf.scanner.frames} images · ` +
      `moyenne ${Math.round(perf.scanner.avgMs)} ms · max ${Math.round(perf.scanner.maxMs)} ms · intervalle ${Math.round(perf.scanner.lastIntervalMs)} ms`,
    `Blocages (> 50 ms) depuis ${minutes.value} min : ${perf.longTasks.count} · total ${Math.round(perf.longTasks.totalMs)} ms · max ${Math.round(perf.longTasks.maxMs)} ms`,
    `MusicBrainz : ${network.value.mb.pending} en attente · réponse moyenne ${network.value.mb.avg} ms`,
    `Discogs : ${network.value.dg.pending} en attente · réponse moyenne ${network.value.dg.avg} ms`,
    dbTest.value
      ? `Base locale : ${dbTest.value.count} CD lus en ${dbTest.value.readMs} ms · écriture ${dbTest.value.writeMs} ms`
      : 'Base locale : test non lancé',
    `Actions lentes (> 200 ms) :`,
    ...(perf.slowInteractions.length
      ? perf.slowInteractions.map((i) => `  ${i.at} · ${i.ms} ms · ${i.what}`)
      : ['  aucune mesurée']),
  ].join('\n'),
)

const copied = ref(false)
async function copy() {
  try {
    await navigator.clipboard.writeText(report.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2500)
  } catch {
    window.prompt('Copie ce texte :', report.value)
  }
}
</script>

<template>
  <section class="card stack">
    <h2>Diagnostic</h2>
    <p class="small muted">
      Si l'appli est lente : utilise-la normalement quelques minutes (scan, recherche…), reviens ici, lance le test de la
      base, puis « Copier le diagnostic » et envoie-le.
    </p>
    <button class="btn btn-small" @click="testDb">Tester la base locale</button>
    <pre class="report">{{ report }}</pre>
    <button class="btn btn-primary" @click="copy">{{ copied ? '✓ Copié' : '📋 Copier le diagnostic' }}</button>
  </section>
</template>

<style scoped>
.report {
  margin: 0;
  padding: 10px;
  border-radius: 8px;
  background: var(--surface-2);
  font-size: 0.72rem;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
