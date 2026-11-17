<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db, requestPersistentStorage } from '../db/database'
import type { CdFormat } from '../db/types'
import { DEFAULT_THICKNESS, FORMAT_LABELS } from '../lib/formats'
import { buildBackup, importBackup, shareOrDownload } from '../services/backup'
import { buildCsv, importCsv } from '../services/csvExport'
import { testToken } from '../services/discogs'
import { testTmdbKey } from '../services/tmdb'
import { testRawgKey } from '../services/rawg'
import { saveSetting, settings } from '../services/settings'
import { startProcessing } from '../services/scanQueue'
import DiagnosticPanel from '../components/DiagnosticPanel.vue'
import ScoresPanel from '../components/ScoresPanel.vue'
import VisionKeyPanel from '../components/VisionKeyPanel.vue'

// Réglages : jeton Discogs, épaisseurs, sauvegarde, effacement.

const cdCount = useLiveQuery(() => db.cds.count(), 0)

// --- Discogs ---
const token = ref(settings.discogsToken)
const showToken = ref(false)
const tokenStatus = ref<'' | 'test' | 'ok' | 'ko'>('')

async function saveToken() {
  await saveSetting('discogsToken', token.value.trim())
  if (!token.value.trim()) {
    tokenStatus.value = ''
    return
  }
  tokenStatus.value = 'test'
  tokenStatus.value = (await testToken()) ? 'ok' : 'ko'
  startProcessing()
}

// --- TMDB (films) ---
const tmdbKey = ref(settings.tmdbKey)
const showTmdbKey = ref(false)
const tmdbStatus = ref<'' | 'test' | 'ok' | 'ko'>('')
async function saveTmdbKey() {
  await saveSetting('tmdbKey', tmdbKey.value.trim())
  if (!tmdbKey.value.trim()) {
    tmdbStatus.value = ''
    return
  }
  tmdbStatus.value = 'test'
  tmdbStatus.value = (await testTmdbKey()) ? 'ok' : 'ko'
}

// --- RAWG (jeux vidéo) ---
const rawgKey = ref(settings.rawgKey)
const showRawgKey = ref(false)
const rawgStatus = ref<'' | 'test' | 'ok' | 'ko'>('')
async function saveRawgKey() {
  await saveSetting('rawgKey', rawgKey.value.trim())
  if (!rawgKey.value.trim()) {
    rawgStatus.value = ''
    return
  }
  rawgStatus.value = 'test'
  rawgStatus.value = (await testRawgKey()) ? 'ok' : 'ko'
}

// --- Épaisseurs ---
const thickness = ref({ ...settings.thickness })
async function saveThickness() {
  await saveSetting('thickness', { ...thickness.value })
}
function resetThickness() {
  thickness.value = { ...DEFAULT_THICKNESS }
  void saveThickness()
}

// --- Sauvegarde ---
const backupMessage = ref<{ text: string; cls: string } | null>(null)
const replaceRules = ref(false)

async function exportData() {
  const file = await buildBackup()
  const how = await shareOrDownload(file)
  backupMessage.value = {
    text: how === 'partage' ? 'Sauvegarde prête à être partagée.' : `Fichier « ${file.name} » téléchargé.`,
    cls: 'notice-ok',
  }
}

async function importData(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const r = await importBackup(file, replaceRules.value)
    backupMessage.value = {
      text: `Import terminé : ${r.added} ajouté(s), ${r.updated} mis à jour, ${r.unchanged} inchangé(s).${r.layoutAdopted ? ' Rangement, meubles et thèmes de l’autre appareil repris.' : r.rulesReplaced ? ' Thèmes, règles et meubles remplacés.' : ''}`,
      cls: 'notice-ok',
    }
  } catch (e) {
    backupMessage.value = { text: e instanceof Error ? e.message : 'Import impossible.', cls: 'notice-danger' }
  }
}

// --- Tableur (CSV) ---
async function exportCsv() {
  const file = await buildCsv()
  const how = await shareOrDownload(file)
  backupMessage.value = {
    text: how === 'partage' ? 'Fichier CSV prêt à être partagé.' : `Fichier « ${file.name} » téléchargé.`,
    cls: 'notice-ok',
  }
}
async function importCsvFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const r = await importCsv(file)
    backupMessage.value = {
      text: `Import CSV terminé : ${r.added} ajouté(s), ${r.updated} mis à jour, ${r.unchanged} inchangé(s)${r.skipped ? `, ${r.skipped} ligne(s) ignorée(s)` : ''}.`,
      cls: 'notice-ok',
    }
  } catch (e) {
    backupMessage.value = { text: e instanceof Error ? e.message : 'Import impossible.', cls: 'notice-danger' }
  }
}

// --- Stockage ---
const persisted = ref<boolean | null>(null)
onMounted(async () => {
  persisted.value = (await navigator.storage?.persisted?.()) ?? null
})
async function askPersist() {
  persisted.value = await requestPersistentStorage()
}

// --- Effacement ---
async function clearQueue() {
  if (window.confirm("Vider la file d'attente du scan ? Les CD déjà ajoutés à la collection ne sont pas touchés.")) {
    await db.scans.clear()
  }
}
async function wipeAll() {
  const answer = window.prompt(
    'Cela efface TOUTE la collection sur cet appareil. Pense à exporter une sauvegarde avant.\nTape EFFACER pour confirmer.',
  )
  if (answer?.trim().toUpperCase() === 'EFFACER') {
    await db.cds.clear()
    await db.scans.clear()
  }
}
</script>

<template>
  <main class="page stack">
    <h1>Réglages</h1>

    <section class="card stack">
      <h2>Discogs (recommandé)</h2>
      <p class="small muted">
        Discogs apporte des genres et styles précis et reconnaît plus de CD. Il faut un compte Discogs gratuit, puis un
        « jeton personnel » : sur discogs.com, menu <em>Settings → Developers</em>, bouton
        <em>Generate new token</em>. Copie-le ici. Il reste uniquement sur cet appareil et n'est jamais inclus dans les
        sauvegardes.
      </p>
      <a class="small" href="https://www.discogs.com/settings/developers" target="_blank" rel="noopener">
        Ouvrir la page Discogs des jetons ↗
      </a>
      <div class="row">
        <input
          v-model="token"
          class="grow"
          :type="showToken ? 'text' : 'password'"
          autocomplete="off"
          placeholder="Colle ton jeton Discogs ici"
          aria-label="Jeton Discogs"
        />
        <button class="btn btn-small" @click="showToken = !showToken">{{ showToken ? 'Masquer' : 'Afficher' }}</button>
      </div>
      <button class="btn btn-primary" @click="saveToken">Enregistrer et tester</button>
      <p v-if="tokenStatus === 'test'" class="notice small">Test en cours…</p>
      <p v-if="tokenStatus === 'ok'" class="notice notice-ok small">Jeton valide : Discogs est actif.</p>
      <p v-if="tokenStatus === 'ko'" class="notice notice-danger small">
        Discogs refuse ce jeton (ou est injoignable). Vérifie qu'il est complet.
      </p>
    </section>

    <section class="card stack">
      <h2>TMDB : films et séries (recommandé)</h2>
      <p class="small muted">
        Pour les films, TMDB ajoute l'affiche, l'année de sortie du film, les genres manquants, et permet de
        chercher un film par son titre. Il faut un compte TMDB gratuit, puis une clé : sur themoviedb.org, menu
        <em>Paramètres → API</em>, demande une clé « Developer » (usage personnel), puis copie la
        <em>Clé d'API</em> (ou le <em>Jeton d'accès en lecture</em>) ici. Elle reste uniquement sur cet appareil et
        n'est jamais incluse dans les sauvegardes.
      </p>
      <a class="small" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">
        Ouvrir la page TMDB des clés ↗
      </a>
      <div class="row">
        <input
          v-model="tmdbKey"
          class="grow"
          :type="showTmdbKey ? 'text' : 'password'"
          autocomplete="off"
          placeholder="Colle ta clé TMDB ici"
          aria-label="Clé TMDB"
        />
        <button class="btn btn-small" @click="showTmdbKey = !showTmdbKey">{{ showTmdbKey ? 'Masquer' : 'Afficher' }}</button>
      </div>
      <button class="btn btn-primary" @click="saveTmdbKey">Enregistrer et tester</button>
      <p v-if="tmdbStatus === 'test'" class="notice small">Test en cours…</p>
      <p v-if="tmdbStatus === 'ok'" class="notice notice-ok small">Clé valide : TMDB est actif.</p>
      <p v-if="tmdbStatus === 'ko'" class="notice notice-danger small">
        TMDB refuse cette clé (ou est injoignable). Vérifie qu'elle est complète.
      </p>
    </section>

    <section class="card stack">
      <h2>RAWG : jeux vidéo (facultatif)</h2>
      <p class="small muted">
        Pour les jeux vidéo, RAWG ajoute une image du jeu, l'année de sortie d'origine, les genres, et permet de chercher
        un jeu par son titre (y compris les jeux importés que la BnF ne connaît pas). Il faut un compte RAWG gratuit,
        puis une clé : sur rawg.io, page <em>API</em> → <em>Get API Key</em>, remplis le petit formulaire (usage
        personnel), puis copie la clé ici. Elle reste uniquement sur cet appareil et n'est jamais incluse dans les
        sauvegardes.
      </p>
      <a class="small" href="https://rawg.io/apidocs" target="_blank" rel="noopener">Ouvrir la page RAWG des clés ↗</a>
      <div class="row">
        <input
          v-model="rawgKey"
          class="grow"
          :type="showRawgKey ? 'text' : 'password'"
          autocomplete="off"
          placeholder="Colle ta clé RAWG ici"
          aria-label="Clé RAWG"
        />
        <button class="btn btn-small" @click="showRawgKey = !showRawgKey">{{ showRawgKey ? 'Masquer' : 'Afficher' }}</button>
      </div>
      <button class="btn btn-primary" @click="saveRawgKey">Enregistrer et tester</button>
      <p v-if="rawgStatus === 'test'" class="notice small">Test en cours…</p>
      <p v-if="rawgStatus === 'ok'" class="notice notice-ok small">Clé valide : RAWG est actif.</p>
      <p v-if="rawgStatus === 'ko'" class="notice notice-danger small">
        RAWG refuse cette clé (ou est injoignable). Vérifie qu'elle est complète.
      </p>
    </section>

    <VisionKeyPanel />

    <ScoresPanel />

    <section class="card stack">
      <h2>Sauvegarde et transfert vers le PC</h2>
      <p class="small muted">
        Les données sont stockées dans ce navigateur, sur cet appareil uniquement. Pour passer du téléphone au PC :
        « Exporter » ici (envoie-toi le fichier par mail ou OneDrive), puis « Importer » sur le PC. L'import fusionne :
        il ajoute les nouveaux CD et garde la version la plus récente des autres, sans rien supprimer.
      </p>
      <p class="small">{{ cdCount }} objet(s) dans la collection sur cet appareil (tous univers).</p>
      <div class="row">
        <button class="btn btn-primary" @click="exportData">⬆️ Exporter / partager</button>
        <label class="btn">
          ⬇️ Importer un fichier
          <input type="file" accept="application/json,.json" hidden @change="importData" />
        </label>
      </div>
      <p class="small muted">
        Tableur (Excel, LibreOffice) : toute la collection, <strong>tous les univers</strong> (colonne « Univers »), avec thème et emplacement. À l'import, une ligne avec un « id »
        connu met cet objet à jour (cellules vides = inchangé) ; une ligne sans id ajoute un objet.
      </p>
      <div class="row">
        <button class="btn" @click="exportCsv">📊 Exporter en CSV</button>
        <label class="btn">
          📥 Importer un CSV
          <input type="file" accept=".csv,text/csv" hidden @change="importCsvFile" />
        </label>
      </div>
      <label class="row small">
        <input v-model="replaceRules" type="checkbox" />
        À l'import, remplacer aussi mes thèmes, règles de classement et meubles par ceux du fichier
      </label>
      <p v-if="backupMessage" class="notice small" :class="backupMessage.cls">{{ backupMessage.text }}</p>
      <p v-if="persisted === false" class="notice notice-warn small">
        Le navigateur pourrait effacer les données si l'appareil manque de place.
        <button class="btn btn-small" @click="askPersist">Protéger mes données</button>
        <br />Installer l'appli sur l'écran d'accueil aide aussi. Dans tous les cas, exporte régulièrement.
      </p>
      <p v-else-if="persisted" class="small muted">✓ Données protégées contre l'effacement automatique.</p>
    </section>

    <section class="card stack">
      <h2>Scan</h2>
      <label class="row small">
        <input
          type="checkbox"
          :checked="settings.feedback"
          @change="saveSetting('feedback', ($event.target as HTMLInputElement).checked)"
        />
        Bip et vibration à chaque code lu
      </label>
      <label class="field">
        Fiche « Où le ranger » : nombre de CD affichés avant et après dans la liste théorique
        <select :value="settings.whereWindow" @change="saveSetting('whereWindow', Number(($event.target as HTMLSelectElement).value))">
          <option v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="n">{{ n }} avant / {{ n }} après</option>
        </select>
      </label>
    </section>

    <section class="card stack">
      <h2>Épaisseurs par format (mm)</h2>
      <p class="small muted">
        Servent à calculer la place dans les meubles (étape 3). Standard et slim sont des tailles normalisées ; les
        autres sont des estimations : mesure quelques-uns de tes digipaks et coffrets et ajuste.
      </p>
      <div class="form-grid">
        <label v-for="(label, key) in FORMAT_LABELS" :key="key" class="field">
          {{ label }}
          <input
            v-model.number="thickness[key as CdFormat]"
            type="number"
            step="0.1"
            min="1"
            inputmode="decimal"
            @change="saveThickness"
          />
        </label>
      </div>
      <p class="small muted">Ne s'applique qu'aux CD ajoutés ensuite (chaque fiche garde son épaisseur, modifiable).</p>
      <button class="btn btn-small" @click="resetThickness">Valeurs par défaut</button>
    </section>

    <DiagnosticPanel />

    <section class="card stack">
      <h2>Effacer</h2>
      <div class="row">
        <button class="btn" @click="clearQueue">Vider la file de scan</button>
        <button class="btn btn-danger" @click="wipeAll">Effacer toute la collection</button>
      </div>
    </section>

    <p class="small muted">
      Données : MusicBrainz (CC0), Discogs, Cover Art Archive, catalogue de la BnF, Open Library, TMDB (ce produit
      utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB), RAWG. Mediamwa fonctionne sans compte et sans serveur.
    </p>
  </main>
</template>
