<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db } from '../db/database'
import type { Cd } from '../db/types'
import { mediaOf, type MediaKind } from '../lib/media'
import { testOmdbKey } from '../services/omdb'
import { needsScores, refreshScores, scoresAvailable, type ScoresProgress } from '../services/scores'
import { saveSetting, settings } from '../services/settings'

// Réglages : avis extérieurs (clé OMDb) et récupération des notes pour les objets déjà dans la collection.

const omdbKey = ref(settings.omdbKey)
const showKey = ref(false)
const status = ref<'' | 'test' | 'ok' | 'ko'>('')
async function saveKey() {
  await saveSetting('omdbKey', omdbKey.value.trim())
  if (!omdbKey.value.trim()) {
    status.value = ''
    return
  }
  status.value = 'test'
  status.value = (await testOmdbKey()) ? 'ok' : 'ko'
}

const all = useLiveQuery(() => db.cds.toArray(), [] as Cd[])
const UNIVERSES: { id: MediaKind; label: string; source: string; need: string }[] = [
  { id: 'jeu', label: '🎮 Jeux', source: 'Metacritic (via RAWG)', need: 'Il faut ta clé RAWG (plus haut).' },
  { id: 'video', label: '🎬 Films', source: 'Metacritic, IMDb, Rotten Tomatoes (via OMDb)', need: 'Il faut une clé OMDb (ci-dessus).' },
  { id: 'cd', label: '🎵 Musique', source: 'note MusicBrainz', need: '' },
]
/** Par univers : objets qui peuvent avoir une note, et date de la dernière mise à jour. */
const stats = computed(() => {
  const m = new Map<MediaKind, { count: number; last: number }>()
  for (const cd of all.value) {
    if (!needsScores(cd, true)) continue
    const st = m.get(mediaOf(cd)) ?? { count: 0, last: 0 }
    st.count++
    st.last = Math.max(st.last, cd.scoresAt ?? 0)
    m.set(mediaOf(cd), st)
  }
  return m
})
const dateOf = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

const running = ref<MediaKind | null>(null)
const progress = ref<ScoresProgress | null>(null)
const lastResult = ref('')
let stop = false
async function run(media: MediaKind, everything = true) {
  running.value = media
  lastResult.value = ''
  stop = false
  const p = await refreshScores(media, (x) => (progress.value = x), { all: everything, shouldStop: () => stop })
  running.value = null
  lastResult.value = `${p.done} vérifiés, ${p.found} avec une note.`
}
</script>

<template>
  <section class="card stack">
    <h2>Avis extérieurs</h2>
    <p class="small muted">
      Notes de la critique et du public, affichées sur la fiche et dans la collection : Metacritic pour les jeux (via
      RAWG), Metacritic + IMDb + Rotten Tomatoes pour les films (via OMDb), note des utilisateurs de MusicBrainz pour la
      musique (affichée à partir de 3 votes). Metacritic n'a pas d'accès libre pour la musique.
    </p>
    <h3>Clé OMDb (films)</h3>
    <p class="small muted">
      Gratuite (1000 demandes par jour) : sur omdbapi.com, page <em>API Key</em>, choisis <em>FREE</em>, entre ton
      e-mail, puis clique le lien d'activation reçu. Colle ici la clé reçue. Elle reste uniquement sur cet appareil et
      n'est jamais incluse dans les sauvegardes.
    </p>
    <a class="small" href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener">Ouvrir la page OMDb des clés ↗</a>
    <div class="row">
      <input v-model="omdbKey" class="grow" :type="showKey ? 'text' : 'password'" autocomplete="off" placeholder="Colle ta clé OMDb ici" aria-label="Clé OMDb" />
      <button class="btn btn-small" @click="showKey = !showKey">{{ showKey ? 'Masquer' : 'Afficher' }}</button>
    </div>
    <button class="btn btn-primary" @click="saveKey">Enregistrer et tester</button>
    <p v-if="status === 'test'" class="notice small">Test en cours…</p>
    <p v-if="status === 'ok'" class="notice notice-ok small">Clé valide : OMDb est actif.</p>
    <p v-if="status === 'ko'" class="notice notice-danger small">OMDb refuse cette clé (ou est injoignable). As-tu cliqué le lien d'activation reçu par e-mail ?</p>

    <h3>Récupérer les notes de ta collection</h3>
    <p class="small muted">Les nouveaux objets reçoivent leurs notes au scan. Ce bouton récupère les notes de TOUS les objets de l'univers (les notes évoluent avec le temps). Garde cet écran ouvert pendant la recherche.</p>
    <div v-for="u in UNIVERSES" :key="u.id" class="row universe">
      <span class="grow small">
        <strong>{{ u.label }}</strong> · {{ u.source }}<br />
        <span class="muted">
          {{ stats.get(u.id)?.count ?? 0 }} à noter<template v-if="stats.get(u.id)?.last"> · dernière mise à jour le {{ dateOf(stats.get(u.id)!.last) }}</template>
        </span>
        <span v-if="!scoresAvailable(u.id)" class="muted"> · {{ u.need }}</span>
      </span>
      <button class="btn btn-small" :disabled="!!running || !scoresAvailable(u.id) || !stats.get(u.id)?.count" @click="run(u.id)">
        Récupérer toutes les notes
      </button>
    </div>
    <template v-if="running && progress">
      <progress :value="progress.done" :max="progress.total || 1"></progress>
      <p class="small">{{ progress.done }} / {{ progress.total }} · {{ progress.found }} avec une note</p>
      <button class="btn btn-small" @click="stop = true">Arrêter</button>
    </template>
    <p v-if="lastResult" class="notice notice-ok small">{{ lastResult }}</p>
  </section>
</template>

<style scoped>
h3 {
  margin: 8px 0 0;
  font-size: 0.95rem;
}
.universe {
  flex-wrap: nowrap;
}
progress {
  width: 100%;
}
.actions {
  gap: 2px;
  align-items: flex-end;
}
.linkish {
  background: none;
  border: 0;
  padding: 0;
  color: var(--primary);
  text-decoration: underline;
  cursor: pointer;
}
.linkish:disabled {
  color: var(--muted);
  cursor: default;
}
</style>
