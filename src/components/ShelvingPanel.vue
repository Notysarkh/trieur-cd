<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLiveQuery } from '../composables/useLiveQuery'
import { itemsOf } from '../db/database'
import type { Cd } from '../db/types'
import { layoutAppliedAtFor } from '../services/settings'
import { itemLabel } from '../lib/media'
import { useMedia } from '../composables/useMedia'
import { lookupForShelving, resetShelved, type ShelvingLookup } from '../services/shelving'
import WhereToShelve from './WhereToShelve.vue'

// Mode « Ranger mes CD » du scanner :
// scan → fiche « Où le ranger » (caméra en pause) → « Rangé ✓ » → retour direct au scanner.

const emit = defineEmits<{ add: [code: string]; open: [boolean] }>()

const { media, w } = useMedia()
const all = useLiveQuery(() => itemsOf(media.value), [] as Cd[])
const located = computed(() => all.value.filter((c) => c.location))
const shelvedCount = computed(() => located.value.filter((c) => c.shelvedAt).length)

const lookup = ref<ShelvingLookup | null>(null)
const cardId = ref<string>()
const lastDone = ref('')

/** Appelé par le scanner pour chaque code lu. Renvoie le type de bip à jouer. */
async function handle(code: string): Promise<'ok' | 'warn'> {
  lastDone.value = ''
  const result = await lookupForShelving(code, media.value)
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
  lastDone.value = `✓ « ${cd.personalCompilation ? cd.title : itemLabel(cd)} » rangé.`
  close()
}
async function reset() {
  if (window.confirm('Remettre le compteur « rangés » à zéro ?')) await resetShelved(media.value)
}
</script>

<template>
  <section class="stack">
    <!-- Fiche « Où le ranger » du CD scanné -->
    <template v-if="cardId">
      <p v-if="lookup && lookup.cds.length > 1" class="notice small">
        {{ lookup.cds.length }} exemplaires de ce {{ w.one }} : voici celui qui n'est pas encore rangé.
      </p>
      <WhereToShelve :cd-id="cardId" done-label="Scanner le suivant" @done="done" @close="close" />
    </template>

    <template v-else>
      <p v-if="lastDone" class="notice notice-ok" role="status">{{ lastDone }} Scanne le {{ w.one }} suivant.</p>

      <div v-if="lookup && !lookup.cds.length" class="card stack">
        <p class="notice notice-warn">Le code {{ lookup.code }} n'est pas dans tes {{ w.many }}.</p>
        <button class="btn" @click="emit('add', lookup.code)">+ L'ajouter à la collection</button>
      </div>

      <div class="card stack">
        <div class="row">
          <strong class="grow">{{ shelvedCount }} / {{ located.length }} {{ w.many }} rangés</strong>
          <button v-if="shelvedCount" class="btn btn-small" @click="reset">Remettre à zéro</button>
        </div>
        <progress :value="shelvedCount" :max="located.length || 1"></progress>
        <p v-if="!layoutAppliedAtFor(media)" class="notice notice-warn small">
          Aucun rangement appliqué : va d'abord dans l'onglet Rangement et appuie sur « Appliquer ce rangement ».
        </p>
        <p v-else class="small muted">
          Scanne un {{ w.one }} de ta pile : sa fiche « Où le ranger » s'ouvre. Pose-le, puis appuie sur « Rangé ✓ ».
        </p>
        <RouterLink class="btn btn-small" to="/sans-code">{{ w.icon }} {{ w.many.charAt(0).toUpperCase() + w.many.slice(1) }} sans code-barres : méthode de la pile triée</RouterLink>
      </div>
    </template>
  </section>
</template>

<style scoped>
progress {
  width: 100%;
}
</style>
