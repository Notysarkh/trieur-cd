<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import CdForm from '../components/CdForm.vue'
import CoverImage from '../components/CoverImage.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { db } from '../db/database'
import type { Cd, CdStatus } from '../db/types'
import { deleteCd, shelvedDate, updateCd } from '../services/collection'
import WhereToShelve from '../components/WhereToShelve.vue'
import { useLiveQuery } from '../composables/useLiveQuery'
import { computePlan } from '../services/classification'
import { locationLabel, releasePlacement } from '../services/layout'
import { layoutAppliedAtFor } from '../services/settings'
import { artistKey, groupKeyOf } from '../classification/engine'
import { mediaOf } from '../lib/media'

// Fiche d'un CD : consultation et modification.

const props = defineProps<{ id: string }>()
const router = useRouter()

/** Copie indépendante d'une fiche (pour comparer avant/après modification). */
const clone = (cd: Cd): Cd => JSON.parse(JSON.stringify(cd))

const original = ref<Cd | null>(null)
const edited = ref<Cd | null>(null)
const loaded = ref(false)
const saved = ref(false)

watch(
  () => props.id,
  async (id) => {
    original.value = (await db.cds.get(id)) ?? null
    edited.value = original.value ? clone(original.value) : null
    loaded.value = true
  },
  { immediate: true },
)

// --- Emplacement dans les meubles (lu en direct : se met à jour après « C'est rangé ») ---
const live = useLiveQuery(() => db.cds.get(props.id), undefined as Cd | undefined)

const dirty = computed(() => JSON.stringify(original.value) !== JSON.stringify(edited.value))

const moved = ref(0)
const sortSpread = ref(0)

async function save(status?: CdStatus) {
  if (!edited.value || !original.value) return
  if (status) edited.value.status = status
  const before = original.value
  // L'emplacement, le statut « rangé » et le thème appliqué sont gérés par le rangement :
  // on ne les réécrit pas depuis le formulaire (ils ont pu changer pendant que la fiche était ouverte).
  const { location, shelvedAt, themeId, shelfOrder, ...fields } = edited.value
  await updateCd(props.id, fields)
  // Champs vidés ou cases décochées (« Sans code-barres », « Sans boîte »…) : on les efface vraiment
  // (une valeur vide n'est pas transmise par updateCd).
  const MANAGED = ['location', 'shelvedAt', 'themeId', 'shelfOrder']
  const cleared = Object.keys(before).filter(
    (k) => !MANAGED.includes(k) && before[k as keyof Cd] !== undefined && fields[k as keyof typeof fields] === undefined,
  )
  // Passé « sans boîte » : il quitte sa place dans les meubles (rangé à part désormais).
  const leaves = edited.value.noBox && !before.noBox && !!live.value?.location
  if (cleared.length || leaves) {
    await db.cds.update(props.id, {
      ...Object.fromEntries(cleared.map((k) => [k, undefined])),
      ...(leaves ? { location: undefined, shelvedAt: undefined } : {}),
    })
  }
  // Nom de tri corrigé : on l'applique à tous les CD de l'artiste (sinon il serait coupé en deux groupes).
  sortSpread.value = 0
  const newSort = (edited.value.artistSort ?? '').trim()
  if (newSort && newSort !== before.artistSort && !before.isCompilation && !before.personalCompilation && !edited.value.personalCompilation) {
    // Livres : le nom de tri est celui de l'AUTEUR → on l'étend aux livres du même auteur,
    // pas à toute la série (une série peut changer d'auteurs : Franquin, puis Tome & Janry…).
    const book = mediaOf(before) === 'livre'
    const keyOf = (c: Cd) => (book ? artistKey(c.artistSort?.trim() || c.artist) : groupKeyOf(c))
    const key = keyOf(before)
    const others = await db.cds
      .filter((c) => c.id !== props.id && mediaOf(c) === mediaOf(before) && keyOf(c) === key)
      .toArray()
    const now = Date.now()
    await db.cds.bulkUpdate(others.map((c) => ({ key: c.id, changes: { artistSort: newSort, updatedAt: now } })))
    sortSpread.value = others.length
  }
  const themeChoiceChanged =
    before.themeOverride !== edited.value.themeOverride ||
    !!before.personalCompilation !== !!edited.value.personalCompilation ||
    before.platform !== edited.value.platform
  moved.value = 0
  if (themeChoiceChanged && layoutAppliedAtFor(mediaOf(before))) {
    // L'objet change-t-il vraiment de thème par rapport au rangement appliqué ?
    const plan = await computePlan(mediaOf(before))
    const newTheme = plan.placement.get(props.id)?.themeId
    if (newTheme && newTheme !== before.themeId) {
      moved.value = await releasePlacement(edited.value, !edited.value.personalCompilation && !before.personalCompilation)
    }
  }
  original.value = clone(edited.value)
  saved.value = true
  setTimeout(() => (saved.value = false), 2500)
}

async function remove() {
  if (!edited.value) return
  if (!window.confirm(`Supprimer « ${edited.value.title} » de ta collection ?`)) return
  await deleteCd(props.id)
  await router.push('/collection')
}
</script>

<template>
  <main class="page stack">
    <p v-if="loaded && !edited" class="notice notice-danger">Cet élément n'existe plus dans ta collection.</p>

    <template v-if="edited">
      <div class="row head">
        <CoverImage :urls="edited.coverUrls" :photo="edited.coverPhoto" :label="edited.title" :size="120" />
        <div class="grow">
          <h1>{{ edited.title }}</h1>
          <p class="muted">{{ edited.artist }}<template v-if="edited.year"> · {{ edited.year }}</template></p>
          <StatusBadge :status="edited.status" :confidence="edited.confidence" />
        </div>
      </div>

      <details v-if="live && (live.location || live.noBox || layoutAppliedAtFor(mediaOf(live)))" class="card" :open="!live.shelvedAt">
        <summary>
          <strong>📦 Où le ranger</strong>
          <span v-if="live.shelvedAt" class="badge badge-ok">✓ rangé le {{ shelvedDate(live) }}</span>
          <span v-else-if="live.noBox" class="small muted"> · à part (sans boîte)</span>
          <span v-else-if="live.location" class="small muted"> · {{ locationLabel(live) }}</span>
        </summary>
        <WhereToShelve :cd-id="live.id" done-label="Fermer" class="embedded" />
      </details>

      <div v-if="edited.status === 'a_verifier'" class="notice notice-warn stack">
        <span>À vérifier : {{ edited.confidenceReasons.join(' · ') }}</span>
        <div class="row">
          <button class="btn btn-small" @click="save('identifie')">✓ C'est bon</button>
          <RouterLink class="btn btn-small" :to="{ name: 'ajouter', query: { cd: id, code: edited.barcode } }">
            🔎 {{ mediaOf(edited) === 'livre' ? 'Rechercher le bon livre' : mediaOf(edited) === 'video' ? 'Rechercher le bon film' : 'Rechercher le bon album' }}
          </RouterLink>
        </div>
      </div>

      <CdForm v-model="edited" />

      <label class="field">
        Statut
        <select v-model="edited.status">
          <option value="identifie">Identifié</option>
          <option value="a_verifier">À vérifier</option>
          <option value="manuel">Manuel</option>
        </select>
      </label>

      <p class="muted small links">
        <a v-if="edited.mbReleaseId" :href="`https://musicbrainz.org/release/${edited.mbReleaseId}`" target="_blank" rel="noopener">
          Voir sur MusicBrainz
        </a>
        <a v-if="edited.discogsReleaseId" :href="`https://www.discogs.com/release/${edited.discogsReleaseId}`" target="_blank" rel="noopener">
          Voir sur Discogs
        </a>
        <a v-if="edited.tmdbId" :href="`https://www.themoviedb.org/${edited.tmdbId.replace(':', '/')}`" target="_blank" rel="noopener">Voir sur TMDB</a>
        <a v-if="edited.rawgId" :href="`https://rawg.io/games/${edited.rawgId}`" target="_blank" rel="noopener">Voir sur RAWG</a>
        <a v-if="edited.bnfArk" :href="`https://catalogue.bnf.fr/${edited.bnfArk}`" target="_blank" rel="noopener">Voir à la BnF</a>
        <span v-if="edited.releaseYear && edited.releaseYear !== edited.year">Cette édition : {{ edited.releaseYear }}</span>
        <span v-if="edited.catalogNumber">Réf. {{ edited.catalogNumber }}</span>
      </p>

      <p v-if="saved" class="notice notice-ok" role="status">Modifications enregistrées.</p>
      <p v-if="sortSpread" class="notice notice-ok" role="status">
        Nom de tri appliqué aussi aux {{ sortSpread }} autre(s) {{ mediaOf(edited) === 'livre' ? 'livre(s) de cet auteur ou de cette série' : 'CD de cet artiste' }}.
      </p>
      <p v-if="moved" class="notice notice-warn" role="status">
        Changement de thème : {{ moved }} CD à déplacer. {{ moved > 1 ? 'Ils sont' : 'Il est' }} maintenant « à ranger » ; la
        fiche « Où le ranger » indique la nouvelle place, sans rien décaler ailleurs.
      </p>

      <div class="row">
        <button class="btn btn-danger" @click="remove">Supprimer</button>
        <span class="grow"></span>
        <button class="btn btn-primary" :disabled="!dirty" @click="save()">Enregistrer</button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.head {
  align-items: flex-start;
  flex-wrap: nowrap;
}
h1 {
  margin: 0;
}
.head p {
  margin: 4px 0 8px;
}
.where {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}
.where p {
  margin: 0;
  flex: 1 1 160px;
}
.links {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
</style>
