<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { db } from './db/database'
import type { Cd } from './db/types'
import { useLiveQuery } from './composables/useLiveQuery'
import { mediaInfo, mediaOf } from './lib/media'
import { currentMedia } from './services/settings'

// Cadre général : le bandeau de l'univers en haut, l'écran courant, la barre de navigation en bas.

const route = useRoute()
const media = computed(() => mediaInfo(currentMedia()))
const onHome = computed(() => route.name === 'accueil')
/** Écran pas encore disponible dans cet univers (il arrive à son étape de la v2). */
const notYet = computed(() => !!route.meta.onlyFor && !route.meta.onlyFor.includes(currentMedia()))
/** Étape de la v2 qui apporte cet écran à l'univers en cours (le rangement arrive à l'étape E). */
const stepForScreen = computed(() => media.value.comingInStep ?? 'E')

const reviewList = useLiveQuery(() => db.cds.where('status').equals('a_verifier').toArray(), [] as Cd[])
const toReview = computed(() => reviewList.value.filter((c) => mediaOf(c) === currentMedia()).length)
const inQueue = useLiveQuery(() => db.scans.count(), 0)

// Bandeau « hors connexion »
const online = ref(navigator.onLine)
const updateOnline = () => (online.value = navigator.onLine)
window.addEventListener('online', updateOnline)
window.addEventListener('offline', updateOnline)
onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnline)
  window.removeEventListener('offline', updateOnline)
})
</script>

<template>
  <div v-if="!online" class="offline">Hors connexion : consultation possible, les identifications reprendront au retour du réseau.</div>

  <RouterLink v-if="!onHome" to="/" class="universe" :aria-label="`Univers ${media.label} : changer d'univers`">
    <span class="universe-name"><span aria-hidden="true">{{ media.icon }}</span> {{ media.label }} ▾</span>
    <span class="universe-brand">Mediamwa</span>
  </RouterLink>

  <main v-if="notYet" class="page stack">
    <h1>{{ media.icon }} {{ media.label }}</h1>
    <div class="card stack">
      <p>
        Cet écran arrive pour les {{ media.many }} à l'étape {{ stepForScreen }} de la version 2. En attendant, il ne sert
        que pour les CD.
      </p>
      <RouterLink to="/" class="btn">← Choisir un autre univers</RouterLink>
    </div>
  </main>
  <RouterView v-else />

  <nav v-if="!onHome" class="tabbar" aria-label="Navigation principale">
    <RouterLink to="/collection" class="tab" exact-active-class="active">
      <span class="icon" aria-hidden="true">{{ media.icon }}</span>
      <span>Collection</span>
    </RouterLink>
    <RouterLink to="/scan" class="tab tab-scan" active-class="active">
      <span class="icon" aria-hidden="true">📷</span>
      <span>Scanner</span>
      <span v-if="inQueue" class="count">{{ inQueue }}</span>
    </RouterLink>
    <RouterLink to="/a-verifier" class="tab" active-class="active">
      <span class="icon" aria-hidden="true">🔎</span>
      <span>À vérifier</span>
      <span v-if="toReview" class="count">{{ toReview }}</span>
    </RouterLink>
    <RouterLink to="/classement" class="tab" active-class="active">
      <span class="icon" aria-hidden="true">🗂️</span>
      <span>Classement</span>
    </RouterLink>
    <RouterLink to="/rangement" class="tab" active-class="active">
      <span class="icon" aria-hidden="true">🪑</span>
      <span>Rangement</span>
    </RouterLink>
    <RouterLink to="/reglages" class="tab" active-class="active">
      <span class="icon" aria-hidden="true">⚙️</span>
      <span>Réglages</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.universe {
  position: sticky;
  top: 0;
  z-index: 9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 16px;
  background: var(--primary);
  color: var(--primary-text);
  text-decoration: none;
  font-size: 0.9rem;
}
.universe-name {
  font-weight: 700;
}
.universe-brand {
  opacity: 0.7;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
}
@media print {
  .universe {
    display: none;
  }
}
.offline {
  background: var(--warn-bg);
  color: var(--warn);
  padding: 8px 16px;
  font-size: 0.875rem;
  text-align: center;
}
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding-bottom: env(safe-area-inset-bottom);
  z-index: 10;
}
.tab {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: var(--nav-height);
  font-size: 0.68rem;
  color: var(--muted);
  text-decoration: none;
}
.tab .icon {
  font-size: 1.4rem;
  line-height: 1;
}
.tab.active {
  color: var(--text);
  font-weight: 700;
}
.tab.active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 25%;
  right: 25%;
  height: 3px;
  border-radius: 0 0 3px 3px;
  background: var(--accent);
}
.count {
  position: absolute;
  top: 6px;
  left: calc(50% + 10px);
  min-width: 20px;
  padding: 0 5px;
  border-radius: 10px;
  background: var(--accent);
  color: #1b1f2a;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
}
</style>
