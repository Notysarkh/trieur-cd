<script setup lang="ts">
import { ref } from 'vue'
import { saveSetting, settings } from '../services/settings'
import { testAnthropicKey, VISION_MODEL } from '../services/vision'

// Réglages : clé API Anthropic pour la reconnaissance des jeux sur photo (Claude Haiku 5.5).

const key = ref(settings.anthropicKey)
const show = ref(false)
const status = ref<'' | 'test' | 'ok' | 'ko'>('')
async function save() {
  await saveSetting('anthropicKey', key.value.trim())
  if (!key.value.trim()) {
    status.value = ''
    return
  }
  status.value = 'test'
  status.value = (await testAnthropicKey()) ? 'ok' : 'ko'
}
</script>

<template>
  <section class="card stack">
    <h2>Reconnaissance par photo (jeux)</h2>
    <p class="small muted">
      Pour identifier les jeux sur une photo (jaquette ou rangée de tranches) : Claude ({{ VISION_MODEL }}) lit les
      titres et la console. Il faut une clé API Anthropic : sur console.anthropic.com, crée un compte, ajoute quelques
      euros de crédit (<em>Billing</em>), puis <em>API Keys</em> → <em>Create Key</em>, et colle-la ici. Coût indicatif :
      moins d'un centime pour des dizaines de photos. La clé reste uniquement sur cet appareil et n'est jamais incluse
      dans les sauvegardes ; les photos sont envoyées à Anthropic pour être lues.
    </p>
    <a class="small" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Ouvrir la page Anthropic des clés ↗</a>
    <div class="row">
      <input v-model="key" class="grow" :type="show ? 'text' : 'password'" autocomplete="off" placeholder="Colle ta clé (sk-ant-…) ici" aria-label="Clé API Anthropic" />
      <button class="btn btn-small" @click="show = !show">{{ show ? 'Masquer' : 'Afficher' }}</button>
    </div>
    <button class="btn btn-primary" @click="save">Enregistrer et tester</button>
    <p v-if="status === 'test'" class="notice small">Test en cours…</p>
    <p v-if="status === 'ok'" class="notice notice-ok small">Clé valide : la reconnaissance par photo est active (Scanner → 📸 Jeux par photo).</p>
    <p v-if="status === 'ko'" class="notice notice-danger small">Anthropic refuse cette clé (ou est injoignable). Vérifie qu'elle est complète et que ton compte a du crédit.</p>
  </section>
</template>
