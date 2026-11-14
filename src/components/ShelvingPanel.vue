<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLiveQuery } from '../composables/useLiveQuery'
import { itemsOf } from '../db/database'
import type { Cd } from '../db/types'
import { settings } from '../services/settings'
import { lookupForShelving, resetShelved, type ShelvingLookup } from '../services/shelving'
import WhereToShelve from './WhereToShelve.vue'

// Mode « Ranger mes CD » du scanner :
// scan → fiche « Où le ranger » (caméra en pause) → « Rangé ✓ » → retour direct au scanner.

const emit = defineEmits<{ add: [code: string]; open: [boolean] }>()

const all = useLiveQuery(() => itemsOf('cd'), [] as Cd[])
const located = computed(() => all.value.filter((c) => c.location))
const shelvedCount = computed(() => located.value.filter((c) => c.shelvedAt).length)

const lookup = ref<ShelvingLookup | null>(null)
const cardId = ref<string>()
const lastDone = ref('')

/** Appelé par le scanner pour chaque code lu. Renvoie le type de bip à jouer. */
async function handle(code: string): Promise<'ok' | 'warn'> {
  lastDone.value = ''
  const result = await lookupForShelving(code)
  lookup.value = result
  cardId.value = result.target?.id
  emit('open', !!cardId.value)
  return result.target ? 'ok' : 'warn'
}
defineExpose({ handle })

function close() {
  cardId.value = undefined
  lookup.value = null
  emit('open', false)
  window.scrollTo({ top: 0 })
}
function done(cd: Cd) {
  lastDone.value = `✓ « ${cd.personalCompilation || cd.isCompilation ? cd.title : `${cd.artist} – ${cd.title}`} » rangé.`
  close()
}
async function reset() {
  if (window.confirm('Remettre le compteur « rangés » à zéro ?')) await resetShelved()
}
</script>

<template>
  <section class="stack">
    <!-- Fiche « Où le ranger » du CD scanné -->
    <template v-if="cardId">
      <p v-if="lookup && lookup.cds.length > 1" class="notice small">
        {{ lookup.cds.length }} exemplaires de ce CD : voici celui qui n'est pas encore rangé.
      </p>
      <WhereToShelve :cd-id="cardId" done-label="Scanner le suivant" @done="done" @close="close" />
    </template>

    <template v-else>
      <p v-if="lastDone" class="notice notice-ok" role="status">{{ lastDone }} Scanne le CD suivant.</p>

      <div v-if="lookup && !lookup.cds.length" class="card stack">
        <p class="notice notice-warn">Le code {{ lookup.code }} n'est pas dans ta collection.</p>
        <button class="btn" @click="emit('add', lookup.code)">+ L'ajouter à la collection</button>
      </div>

      <div class="card stack">
        <div class="row">
          <strong class="grow">{{ shelvedCount }} / {{ located.length }} CD rangés</strong>
          <button v-if="shelvedCount" class="btn btn-small" @click="reset">Remettre à zéro</button>
        </div>
        <progress :value="shelvedCount" :max="located.length || 1"></progress>
        <p v-if="!settings.layoutAppliedAt" class="notice notice-warn small">
          Aucun rangement appliqué : va d'abord dans l'onglet Rangement et appuie sur « Appliquer ce rangement ».
        </p>
        <p v-else class="small muted">
          Scanne un CD de ta pile : sa fiche « Où le ranger » s'ouvre. Pose-le, puis appuie sur « Rangé ✓ ».
        </p>
        <RouterLink class="btn btn-small" to="/sans-code">💿 CD sans code-barres : méthode de la pile triée</RouterLink>
      </div>
    </template>
  </section>
</template>

<style scoped>
progress {
  width: 100%;
}
</style>
