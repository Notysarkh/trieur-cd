<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLiveQuery } from '../composables/useLiveQuery'
import { itemsOf } from '../db/database'
import type { Cd } from '../db/types'
import { hasDiscogsToken } from '../services/discogs'
import { canPrice, money, refreshPrices, totalValue, type PricesProgress } from '../services/prices'

// Réglages : valeur des disques sur le marché Discogs (musique).

const discs = useLiveQuery(() => itemsOf('cd'), [] as Cd[])
const priceable = computed(() => discs.value.filter(canPrice).length)
const last = computed(() => Math.max(0, ...discs.value.map((c) => c.market?.at ?? 0)))
const total = computed(() => totalValue(discs.value))

const running = ref(false)
const progress = ref<PricesProgress | null>(null)
const result = ref('')
let stop = false
async function run() {
  running.value = true
  result.value = ''
  stop = false
  const p = await refreshPrices((x) => (progress.value = x), { shouldStop: () => stop })
  running.value = false
  result.value =
    `${p.done} disque${p.done > 1 ? 's' : ''} vérifié${p.done > 1 ? 's' : ''}, ${p.found} avec un prix.` +
    (p.suggestions === 'refuse'
      ? ' Prix conseillés indisponibles : remplis tes paramètres de vendeur sur Discogs (voir ci-dessus), puis relance.'
      : p.suggestions === 'ok'
        ? ' Prix conseillés (état VG+) récupérés.'
        : '')
}
/** Durée approximative : 1 s par demande avec le jeton (2 demandes par disque), 2,5 s sans. */
const disques = (n: number) => `${n} disque${n > 1 ? 's' : ''}`
const minutes = computed(() => Math.max(1, Math.round((priceable.value * (hasDiscogsToken() ? 2 : 2.5)) / 60)))
</script>

<template>
  <section class="card stack">
    <h2>Valeur de ta musique (Discogs)</h2>
    <p class="small muted">
      Pour chaque disque relié à son édition Discogs : le prix le plus bas actuellement en vente et le nombre
      d'exemplaires en vente (en euros). Avec ton jeton Discogs, l'appli retrouve aussi l'édition des autres disques par
      leur code-barres, et demande le <strong>prix conseillé pour un exemplaire en très bon état (VG+)</strong>, plus proche
      d'une vraie valeur que l'offre la moins chère. Ce prix conseillé demande d'avoir rempli une fois tes
      <em>paramètres de vendeur</em> sur Discogs (sans rien mettre en vente).
    </p>
    <a class="small" href="https://www.discogs.com/settings/seller" target="_blank" rel="noopener">Ouvrir mes paramètres de vendeur Discogs ↗</a>
    <p class="small">
      <strong>{{ disques(priceable) }}</strong> à évaluer<template v-if="!hasDiscogsToken()"> (sans jeton : seulement ceux déjà reliés à Discogs)</template>
      <template v-if="last"> · dernière mise à jour le {{ new Date(last).toLocaleDateString('fr-FR') }}</template>
      <template v-if="total.counted"> · valeur estimée <strong>{{ money(total.eur) }}</strong> ({{ disques(total.counted) }})</template>
    </p>
    <button class="btn btn-primary" :disabled="running || !priceable" @click="run">💶 Mettre à jour les prix (environ {{ minutes }} min)</button>
    <template v-if="running && progress">
      <progress :value="progress.done" :max="progress.total || 1"></progress>
      <p class="small">{{ progress.done }} / {{ progress.total }} · {{ progress.found }} avec un prix</p>
      <p v-if="progress.suggestions === 'refuse'" class="notice notice-warn small">
        Discogs refuse le prix conseillé : remplis tes paramètres de vendeur (lien ci-dessus). Les prix les plus bas continuent d'être récupérés.
      </p>
      <button class="btn btn-small" @click="stop = true">Arrêter</button>
    </template>
    <p v-if="result" class="notice notice-ok small">{{ result }}</p>
    <p class="small muted">Garde cet écran ouvert pendant la mise à jour. « Ma valeur » (sur la fiche) passe toujours avant l'estimation.</p>
  </section>
</template>

<style scoped>
progress {
  width: 100%;
}
</style>
