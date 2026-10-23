<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BarcodeScanner from '../components/BarcodeScanner.vue'
import ScanQueueItem from '../components/ScanQueueItem.vue'
import ShelvingPanel from '../components/ShelvingPanel.vue'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db } from '../db/database'
import type { ScanItem } from '../db/types'
import { signal, unlockAudio } from '../lib/feedback'
import { hasDiscogsToken } from '../services/discogs'
import { addScan, isReady, retryErrors, sendUnknownToReview, validateReady } from '../services/scanQueue'
import { saveSetting, settings } from '../services/settings'

// Écran de scan, en deux modes :
// - « Ajouter » : caméra (ou saisie du code), file d'attente, validation groupée ;
// - « Ranger » : chaque CD rescanné affiche son emplacement dans les meubles (après un scan d'inventaire).

const route = useRoute()
const router = useRouter()
const mode = ref<'ajouter' | 'ranger'>(route.query.mode === 'ranger' ? 'ranger' : 'ajouter')
watch(mode, (m) => void router.replace({ query: m === 'ranger' ? { mode: 'ranger' } : {} }))
const shelving = ref<InstanceType<typeof ShelvingPanel>>()

const queue = useLiveQuery(() => db.scans.orderBy('scannedAt').reverse().toArray(), [] as ScanItem[])
const ownedAlbums = useLiveQuery(
  async () => new Set((await db.cds.orderBy('mbReleaseGroupId').uniqueKeys()) as string[]),
  new Set<string>(),
)

const counts = computed(() => {
  const c = { attente: 0, prets: 0, choisir: 0, introuvables: 0, erreurs: 0 }
  for (const i of queue.value) {
    if (i.state === 'en_attente' || i.state === 'recherche' || (i.state === 'trouve' && !isReady(i))) c.attente++
    else if (i.state === 'trouve' && i.include) c.prets++
    else if (i.state === 'a_choisir') c.choisir++
    else if (i.state === 'introuvable') c.introuvables++
    else if (i.state === 'erreur') c.erreurs++
  }
  return c
})

// Message après chaque scan
const message = ref<{ text: string; cls: string } | null>(null)
let messageTimer: ReturnType<typeof setTimeout> | undefined
function show(text: string, cls: string) {
  message.value = { text, cls }
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => (message.value = null), 4000)
}

// Hors mode rafale, on met la caméra en pause après chaque code.
const paused = ref(false)

async function onCode(code: string) {
  if (mode.value === 'ranger') {
    signal((await shelving.value?.handle(code)) ?? 'warn')
    if (!settings.burstMode) paused.value = true
    return
  }
  const result = await addScan(code)
  if (result === 'ajoute') {
    signal('ok')
    show(`Code ${code} ajouté à la file.`, 'notice-ok')
    if (!settings.burstMode) paused.value = true
  } else if (result === 'deja_dans_la_file') {
    signal('warn')
    show(`Code ${code} déjà dans la file.`, 'notice-warn')
  } else {
    signal('error')
    show(`Le code ${code} semble faux (clé de contrôle incorrecte). Vérifie-le.`, 'notice-danger')
  }
}

// Saisie manuelle du code (ou douchette USB sur PC, qui « tape » le code comme un clavier)
const typed = ref('')
async function submitTyped() {
  const code = typed.value.trim()
  if (!code) return
  unlockAudio()
  // On vide le champ tout de suite : une douchette peut envoyer le code suivant très vite.
  typed.value = ''
  await onCode(code)
}

const busy = ref(false)
async function validate() {
  busy.value = true
  try {
    const n = await validateReady()
    show(`${n} CD ajouté${n > 1 ? 's' : ''} à ta collection.`, 'notice-ok')
  } finally {
    busy.value = false
  }
}

/** Depuis le mode rangement : un CD inconnu est ajouté à la file du mode « Ajouter ». */
async function addFromShelving(code: string) {
  mode.value = 'ajouter'
  await onCode(code)
}

async function unknownToReview() {
  const n = await sendUnknownToReview()
  show(`${n} code${n > 1 ? 's' : ''} envoyé${n > 1 ? 's' : ''} dans « À vérifier ».`, 'notice-ok')
}
</script>

<template>
  <main class="page stack">
    <h1>Scanner mes CD</h1>

    <div class="modes" role="tablist" aria-label="Mode du scanner">
      <button role="tab" class="chip" :class="{ active: mode === 'ajouter' }" :aria-selected="mode === 'ajouter'" @click="mode = 'ajouter'">
        ➕ Ajouter des CD
      </button>
      <button role="tab" class="chip" :class="{ active: mode === 'ranger' }" :aria-selected="mode === 'ranger'" @click="mode = 'ranger'">
        📦 Ranger mes CD
      </button>
    </div>

    <p v-if="mode === 'ajouter' && !hasDiscogsToken()" class="notice small">
      Astuce : ajoute ton jeton Discogs dans les <RouterLink to="/reglages">Réglages</RouterLink> pour de meilleurs
      genres et plus de CD reconnus.
    </p>

    <BarcodeScanner :paused="paused" :compact="mode === 'ranger'" @detected="onCode" @resume="paused = false" />

    <form class="row" @submit.prevent="submitTyped">
      <input
        v-model="typed"
        class="grow"
        inputmode="numeric"
        autocomplete="off"
        placeholder="…ou tape le code-barres"
        aria-label="Code-barres"
      />
      <button class="btn" type="submit">{{ mode === 'ranger' ? 'Chercher' : 'Ajouter' }}</button>
    </form>

    <label v-if="mode === 'ajouter'" class="row small">
      <input
        type="checkbox"
        :checked="settings.burstMode"
        @change="saveSetting('burstMode', ($event.target as HTMLInputElement).checked)"
      />
      Mode rafale : la caméra reste active, les scans s'enchaînent
    </label>

    <ShelvingPanel v-if="mode === 'ranger'" ref="shelving" @add="addFromShelving" />

    <p v-if="message" class="notice" :class="message.cls" role="status">{{ message.text }}</p>

    <section v-if="mode === 'ajouter' && queue.length" class="stack">
      <h2>File d'attente ({{ queue.length }})</h2>
      <p class="muted small">
        {{ counts.prets }} prêt{{ counts.prets > 1 ? 's' : '' }}
        <template v-if="counts.attente"> · {{ counts.attente }} en cours (≈ {{ counts.attente * 2 }} s)</template>
        <template v-if="counts.choisir"> · {{ counts.choisir }} à choisir</template>
        <template v-if="counts.introuvables"> · {{ counts.introuvables }} introuvable{{ counts.introuvables > 1 ? 's' : '' }}</template>
        <template v-if="counts.erreurs"> · {{ counts.erreurs }} en erreur</template>
      </p>

      <button class="btn btn-primary btn-big" :disabled="!counts.prets || busy" @click="validate">
        ✓ Ajouter {{ counts.prets }} CD à ma collection
      </button>
      <div class="row">
        <button v-if="counts.introuvables" class="btn btn-small" @click="unknownToReview">
          Introuvables → « À vérifier »
        </button>
        <button v-if="counts.erreurs" class="btn btn-small" @click="retryErrors()">Réessayer les erreurs</button>
      </div>

      <ul class="cd-list">
        <ScanQueueItem v-for="item in queue" :key="item.id" :item="item" :owned-albums="ownedAlbums" />
      </ul>
    </section>
    <p v-else-if="mode === 'ajouter'" class="muted">La file est vide. Scanne un premier CD !</p>
  </main>
</template>

<style scoped>
.modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.modes .chip {
  padding: 10px;
  font-weight: 600;
}
</style>
