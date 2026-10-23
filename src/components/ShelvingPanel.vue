<script setup lang="ts">
import { computed, ref } from 'vue'
import { buildPlan, UNCLASSIFIED_THEME } from '../classification/engine'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db } from '../db/database'
import type { ArtistInfo, Cd } from '../db/types'
import { insertionFor, locationParts, placeCd, shortLocation } from '../services/layout'
import { settings } from '../services/settings'
import { resetShelved, rowOf, setShelved, shelveByBarcode, type ShelvingResult } from '../services/shelving'
import CoverImage from './CoverImage.vue'
import LocationMap from './LocationMap.vue'

// Mode « rangement » : chaque CD rescanné affiche en grand où le poser, et compte comme rangé.

const emit = defineEmits<{ add: [code: string] }>()

const all = useLiveQuery(() => db.cds.toArray(), [] as Cd[])
const artistInfos = useLiveQuery(
  async () => new Map((await db.artists.toArray()).map((a) => [a.mbArtistId, a])),
  new Map<string, ArtistInfo>(),
)
const located = computed(() => all.value.filter((c) => c.location))
const shelvedCount = computed(() => located.value.filter((c) => c.shelvedAt).length)

const current = ref<ShelvingResult | null>(null)
const history = ref<{ code: string; text: string }[]>([])
const showRow = ref(false)

/** Version à jour (en direct) du CD affiché. */
const shown = computed(() => {
  const id = current.value?.shelved?.id ?? current.value?.cds[0]?.id
  return all.value.find((c) => c.id === id)
})
const parts = computed(() => (shown.value ? locationParts(shown.value) : null))
const furniture = computed(() => settings.furniture.find((f) => f.id === shown.value?.location?.furnitureId))
const theme = computed(() => {
  const id = shown.value?.themeId
  return (id && settings.classification.themes.find((t) => t.id === id)) || UNCLASSIFIED_THEME
})
const row = computed(() => (shown.value ? rowOf(shown.value, all.value) : []))
const neighbours = computed(() => {
  const i = row.value.findIndex((c) => c.id === shown.value?.id)
  return { before: row.value[i - 1], after: row.value[i + 1] }
})
// CD pas encore placé (ajouté après le rangement) : où le glisser.
const insertion = computed(() => {
  if (!shown.value || shown.value.location || !settings.layoutAppliedAt) return null
  const plan = buildPlan(all.value, settings.classification, artistInfos.value)
  return { plan, ins: insertionFor(shown.value, plan, all.value) }
})

const name = (cd: Cd | undefined) => (cd ? (cd.isCompilation ? cd.title : `${cd.artist} — ${cd.title}`) : '')

/** Appelé par le scanner pour chaque code lu. Renvoie le type de bip à jouer. */
async function handle(code: string): Promise<'ok' | 'warn'> {
  showRow.value = false
  const result = await shelveByBarcode(code)
  current.value = result
  const cd = result.shelved ?? result.cds[0]
  history.value.unshift({
    code: result.code,
    text: cd ? `${name(cd)} → ${shortLocation(cd) ?? 'pas encore placé'}` : `${result.code} : pas dans la collection`,
  })
  if (history.value.length > 6) history.value.pop()
  return result.shelved ? 'ok' : 'warn'
}
defineExpose({ handle })

async function undo() {
  if (shown.value) await setShelved(shown.value.id, false)
}
async function reset() {
  if (window.confirm('Remettre le compteur « rangés » à zéro ?')) await resetShelved()
}
</script>

<template>
  <section class="stack">

    <!-- Résultat du dernier scan -->
    <div v-if="current && !current.cds.length" class="card stack">
      <p class="notice notice-warn">Le code {{ current.code }} n'est pas dans ta collection.</p>
      <button class="btn" @click="emit('add', current.code)">+ L'ajouter à la collection</button>
    </div>

    <div v-else-if="shown" class="card stack result" :style="{ '--theme': theme.color }">
      <div class="row top">
        <CoverImage :urls="shown.coverUrls" :photo="shown.coverPhoto" :label="shown.title" :size="64" />
        <div class="grow">
          <div class="theme-name">{{ theme.name }}</div>
          <strong>{{ shown.isCompilation ? shown.title : shown.artist }}</strong>
          <div v-if="!shown.isCompilation" class="small">{{ shown.title }}<template v-if="shown.year"> ({{ shown.year }})</template></div>
        </div>
      </div>

      <template v-if="parts">
        <div class="where">
          <div class="big">{{ parts.furniture }} · niveau {{ parts.level }}</div>
          <div class="big">
            <template v-if="parts.column">case {{ parts.column }} · </template>
            <template v-if="parts.layer">{{ parts.layer }} · </template>
            <template v-if="parts.side">{{ parts.side }} · </template>n° {{ parts.position }}
          </div>
          <div class="small">
            <template v-if="neighbours.before">après « {{ name(neighbours.before) }} »</template>
            <template v-if="neighbours.before && neighbours.after"><br /></template>
            <template v-if="neighbours.after">avant « {{ name(neighbours.after) }} »</template>
          </div>
        </div>
        <LocationMap v-if="furniture" :furniture="furniture" :slot-id="shown.location!.slotId" :position="shown.location!.position" />
        <div class="row">
          <span v-if="shown.shelvedAt" class="badge badge-ok">✓ compté comme rangé</span>
          <button v-if="shown.shelvedAt" class="btn btn-small" @click="undo">Annuler</button>
          <span v-if="current && current.cds.length > 1" class="small muted">{{ current.cds.length }} exemplaires de ce CD</span>
        </div>
        <button class="btn btn-small" @click="showRow = !showRow">
          {{ showRow ? "Masquer l'ordre de la rangée" : `Ordre de la rangée (${row.length} CD)` }}
        </button>
        <ol v-if="showRow" class="row-list small">
          <li v-for="c in row" :key="c.id" :class="{ me: c.id === shown.id }">
            {{ c.shelvedAt ? '✓' : '·' }} {{ name(c) }}
          </li>
        </ol>
      </template>

      <template v-else-if="insertion?.ins">
        <p>
          <strong>Ajouté après le rangement.</strong> Glisse-le ici :<br />
          📍 {{ insertion.ins.slot.label }}, place n° {{ insertion.ins.position }}
          <template v-if="insertion.ins.after"><br />juste après « {{ name(insertion.ins.after) }} »</template>
        </p>
        <button class="btn btn-primary" @click="placeCd(shown, insertion.ins, insertion.plan)">✓ C'est rangé</button>
      </template>
      <p v-else class="notice small">Ce CD n'a pas encore d'emplacement : applique le rangement (onglet Rangement).</p>
    </div>

    <div class="card stack progress-card">
      <div class="row">
        <strong class="grow">{{ shelvedCount }} / {{ located.length }} CD rangés</strong>
        <button v-if="shelvedCount" class="btn btn-small" @click="reset">Remettre à zéro</button>
      </div>
      <progress :value="shelvedCount" :max="located.length || 1"></progress>
      <p v-if="!settings.layoutAppliedAt" class="notice notice-warn small">
        Aucun rangement appliqué : va d'abord dans l'onglet Rangement et appuie sur « Appliquer ce rangement ».
      </p>
      <p v-else class="small muted">Scanne chaque CD de ta pile : l'appli te dit où le poser et le compte comme rangé.</p>
    </div>

    <div v-if="history.length > 1" class="card">
      <p class="small muted label">Derniers scans</p>
      <ul class="plain small">
        <li v-for="(h, i) in history.slice(1)" :key="i">{{ h.text }}</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
progress {
  width: 100%;
}
.result {
  border-left: 8px solid var(--theme);
}
.top {
  flex-wrap: nowrap;
  align-items: flex-start;
}
.theme-name {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--theme);
}
.where {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface-2);
}
.big {
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1.25;
}
.row-list {
  margin: 0;
  padding-left: 26px;
}
.row-list .me {
  font-weight: 700;
  color: var(--theme);
}
.label {
  margin: 0 0 4px;
}
.plain {
  margin: 0;
  padding-left: 18px;
}
</style>
