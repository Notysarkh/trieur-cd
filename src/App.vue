<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { db } from './db/database'
import { useLiveQuery } from './composables/useLiveQuery'

// Cadre général : l'écran courant + la barre de navigation en bas.

const toReview = useLiveQuery(() => db.cds.where('status').equals('a_verifier').count(), 0)
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

  <RouterView />

  <nav class="tabbar" aria-label="Navigation principale">
    <RouterLink to="/" class="tab" exact-active-class="active">
      <span class="icon" aria-hidden="true">💿</span>
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
