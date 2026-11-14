<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import CdForm from '../components/CdForm.vue'
import CoverImage from '../components/CoverImage.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { db } from '../db/database'
import type { Cd, CdStatus } from '../db/types'
import { deleteCd, shelvedDate, updateCd } from '../services/collection'
import LocationMap from '../components/LocationMap.vue'
import { buildPlan } from '../classification/engine'
import { useLiveQuery } from '../composables/useLiveQuery'
import type { ArtistInfo } from '../db/types'
import { insertionFor, locationLabel, placeCd } from '../services/layout'
import { settings } from '../services/settings'

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
const all = useLiveQuery(() => db.cds.toArray(), [] as Cd[])
const artistInfos = useLiveQuery(
  async () => new Map((await db.artists.toArray()).map((a) => [a.mbArtistId, a])),
  new Map<string, ArtistInfo>(),
)
const live = computed(() => all.value.find((c) => c.id === props.id))
const furnitureOf = computed(() => settings.furniture.find((f) => f.id === live.value?.location?.furnitureId))
const plan = computed(() => buildPlan(all.value, settings.classification, artistInfos.value))
const insertion = computed(() =>
  live.value && !live.value.location && settings.layoutAppliedAt ? insertionFor(live.value, plan.value, all.value) : null,
)
const name = (cd: Cd | undefined) => (cd ? (cd.isCompilation ? cd.title : `${cd.artist} — ${cd.title}`) : '')

const dirty = computed(() => JSON.stringify(original.value) !== JSON.stringify(edited.value))

async function save(status?: CdStatus) {
  if (!edited.value) return
  if (status) edited.value.status = status
  await updateCd(props.id, edited.value)
  original.value = clone(edited.value)
  saved.value = true
  setTimeout(() => (saved.value = false), 2500)
}

async function remove() {
  if (!edited.value) return
  if (!window.confirm(`Supprimer « ${edited.value.title} » de ta collection ?`)) return
  await deleteCd(props.id)
  await router.push('/')
}
</script>

<template>
  <main class="page stack">
    <p v-if="loaded && !edited" class="notice notice-danger">Ce CD n'existe plus dans ta collection.</p>

    <template v-if="edited">
      <div class="row head">
        <CoverImage :urls="edited.coverUrls" :photo="edited.coverPhoto" :label="edited.title" :size="120" />
        <div class="grow">
          <h1>{{ edited.title }}</h1>
          <p class="muted">{{ edited.artist }}<template v-if="edited.year"> · {{ edited.year }}</template></p>
          <StatusBadge :status="edited.status" :confidence="edited.confidence" />
        </div>
      </div>

      <section v-if="live?.location && furnitureOf" class="card where">
        <LocationMap :furniture="furnitureOf" :slot-id="live.location.slotId" :position="live.location.position" />
        <p>
          <strong>📍 {{ locationLabel(live) }}</strong><br />
          <span v-if="live.shelvedAt" class="badge badge-ok">✓ rangé le {{ shelvedDate(live) }}</span>
          <span v-else class="badge badge-warn">à ranger</span>
        </p>
      </section>
      <section v-else-if="live && insertion" class="card stack">
        <p>
          <strong>Pas encore rangé.</strong> Glisse-le ici :<br />
          📍 {{ insertion.slot.label }}, place n° {{ insertion.position }}
          <template v-if="insertion.after"><br />juste après « {{ name(insertion.after) }} »</template>
          <template v-if="insertion.before"><br />juste avant « {{ name(insertion.before) }} »</template>
        </p>
        <p v-if="!insertion.fits" class="notice notice-warn small">
          Cette rangée est pleine : pousse son dernier CD au début de la rangée suivante.
        </p>
        <button class="btn btn-primary" @click="placeCd(live, insertion, plan)">✓ C'est rangé</button>
      </section>

      <div v-if="edited.status === 'a_verifier'" class="notice notice-warn stack">
        <span>À vérifier : {{ edited.confidenceReasons.join(' · ') }}</span>
        <div class="row">
          <button class="btn btn-small" @click="save('identifie')">✓ C'est bon</button>
          <RouterLink class="btn btn-small" :to="{ name: 'ajouter', query: { cd: id, code: edited.barcode } }">
            🔎 Rechercher le bon album
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
        <span v-if="edited.releaseYear && edited.releaseYear !== edited.year">Cette édition : {{ edited.releaseYear }}</span>
        <span v-if="edited.catalogNumber">Réf. {{ edited.catalogNumber }}</span>
      </p>

      <p v-if="saved" class="notice notice-ok" role="status">Modifications enregistrées.</p>

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
