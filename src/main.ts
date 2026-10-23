import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { loadSettings } from './services/settings'
import { recoverQueue } from './services/scanQueue'
import { requestPersistentStorage } from './db/database'
import './styles.css'

// Point de départ de l'appli : on charge les réglages, puis on affiche l'interface.
async function start() {
  await loadSettings()
  createApp(App).use(router).mount('#app')
  // Reprend les identifications laissées en suspens à la dernière fermeture.
  void recoverQueue()
  // Demande au navigateur de ne pas effacer nos données.
  void requestPersistentStorage()
}

void start()
