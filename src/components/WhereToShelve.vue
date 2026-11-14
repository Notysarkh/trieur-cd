<script setup lang="ts">
import { computed } from 'vue'
import { buildPlan, UNCLASSIFIED_THEME } from '../classification/engine'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db } from '../db/database'
import type { ArtistInfo, Cd } from '../db/types'
import { whereToShelve } from '../layout/assistant'
import { shelvedDate } from '../services/collection'
import { insertionFor, locationParts, placeCd } from '../services/layout'
import { settings } from '../services/settings'
import { setShelved } from '../services/shelving'
import CoverImage from './CoverImage.vue'
import LocationMap from './LocationMap.vue'

// Fiche « Où le ranger » d'un CD, en trois blocs :
// 1. l'emplacement cible ; 2. la liste théorique (le plan autour du CD) ;
// 3. la liste réelle (ses voisins parmi les CD déjà posés) avec la consigne.
// Gros bouton « Rangé ✓ » en bas, utilisable d'une main.

const props = defineProps<{ cdId: string; doneLabel?: string }>()
const emit = defineEmits<{ done: [cd: Cd]; close: [] }>()

const all = useLiveQuery(() => db.cds.toArray(), [] as Cd[])
const artistInfos = useLiveQuery(
  async () => new Map((await db.artists.toArray()).map((a) => [a.mbArtistId, a])),
  new Map<string, ArtistInfo>(),
)

const cd = computed(() => all.value.find((c) => c.id === props.cdId))
// CD ajouté après le rangement : on calcule la place où le glisser (sans rien recalculer d'autre).
const insertion = computed(() => {
  if (!cd.value || cd.value.location || !settings.layoutAppliedAt) return null
  const plan = buildPlan(all.value, settings.classification, artistInfos.value)
  return { plan, ins: insertionFor(cd.value, plan, all.value) }
})
const info = computed(() =>
  cd.value
    ? whereToShelve(cd.value, all.value, settings.furniture, settings.whereWindow, insertion.value?.ins ?? null)
    : null,
)
const parts = computed(() => {
  if (!cd.value || !info.value) return null
  const fake = { ...cd.value, location: { furnitureId: info.value.slot.furnitureId, slotId: info.value.slot.id, position: info.value.position } }
  return locationParts(fake)
})
const furniture = computed(() => settings.furniture.find((f) => f.id === info.value?.slot.furnitureId))
const theme = computed(() => {
  const id = cd.value?.themeId
  return (id && settings.classification.themes.find((t) => t.id === id)) || UNCLASSIFIED_THEME
})

const name = (c: Cd | undefined) => (c ? (c.isCompilation || c.personalCompilation ? c.title : `${c.artist} – ${c.title}`) : '')
const cm = (mm: number) => Math.max(1, Math.round(mm / 10))
const pct = (p: { done: number; all: number }) => (p.all ? Math.round((p.done / p.all) * 100) : 0)

/** La consigne de placement, en une phrase. */
const instruction = computed(() => {
  const r = info.value?.real
  if (!r) return ''
  if (r.emptyRow) return `Premier CD de cette rangée : place-le ${r.hint}.`
  if (r.before && r.after) return `Place-le entre « ${name(r.before)} » et « ${name(r.after)} ».`
  if (r.after) return `Place-le au début de la rangée, avant « ${name(r.after)} ».`
  if (r.before) return `Place-le à la fin de la rangée, après « ${name(r.before)} ».`
  return ''
})

async function shelve() {
  const c = cd.value
  if (!c) return
  if (c.location) await setShelved(c.id, true)
  else if (insertion.value?.ins) await placeCd(c, insertion.value.ins, insertion.value.plan)
  emit('done', c)
}
async function unshelve() {
  if (cd.value) await setShelved(cd.value.id, false)
}
</script>

<template>
  <section v-if="cd" class="where-card stack" :style="{ '--theme': theme.color }">
    <!-- En-tête : le CD -->
    <div class="row head">
      <CoverImage :urls="cd.coverUrls" :photo="cd.coverPhoto" :label="cd.title" :size="56" />
      <div class="grow">
        <div class="theme-name">{{ theme.name }}</div>
        <strong>{{ cd.personalCompilation ? cd.title : cd.isCompilation ? cd.title : cd.artist }}</strong>
        <div v-if="!cd.isCompilation && !cd.personalCompilation" class="small">
          {{ cd.title }}<template v-if="cd.year"> ({{ cd.year }})</template>
        </div>
      </div>
      <span v-if="cd.shelvedAt" class="badge badge-ok">✓ rangé le {{ shelvedDate(cd) }}</span>
    </div>

    <p v-if="!info" class="notice notice-warn">
      Ce CD n'a pas encore d'emplacement : applique d'abord le rangement (onglet Rangement).
    </p>

    <template v-else>
      <!-- Bloc 1 : emplacement cible -->
      <div class="block target">
        <h3>📍 Emplacement</h3>
        <div class="big">{{ parts?.furniture }} · niveau {{ parts?.level }}</div>
        <div class="big">
          <template v-if="parts?.column">case {{ parts.column }} · </template>
          <template v-if="parts?.layer">{{ parts.layer }} · </template>
          <template v-if="parts?.side">{{ parts.side }} · </template>{{ info.position }}<sup>{{ info.position === 1 ? 'er' : 'e' }}</sup> position
        </div>
        <p v-if="!info.located" class="small">Ajouté après le rangement : place proposée sans rien décaler ailleurs.</p>
        <LocationMap v-if="furniture" :furniture="furniture" :slot-id="info.slot.id" :position="info.position" />
      </div>

      <!-- Bloc 2 : liste théorique -->
      <div class="block">
        <h3>Liste théorique (le plan)</h3>
        <ul class="lines">
          <li v-for="l in info.theoretical" :key="l.cd.id" :class="{ me: l.isTarget }">
            <span v-if="l.otherSlot" class="other small muted">{{ l.otherSlot }}</span>
            <div class="line">
              <CoverImage :urls="l.cd.coverUrls" :photo="l.cd.coverPhoto" :label="l.cd.title" :size="32" />
              <span class="grow text">{{ name(l.cd) }}</span>
              <span v-if="l.isTarget" class="badge badge-info">ce CD</span>
              <span v-else-if="l.cd.shelvedAt" class="badge badge-ok">Rangé ✓</span>
              <span v-else class="badge badge-warn">À ranger</span>
            </div>
          </li>
        </ul>
      </div>

      <!-- Bloc 3 : liste réelle -->
      <div class="block real">
        <h3>Liste réelle (CD déjà posés)</h3>
        <p v-if="info.real.sameAsPlan && !info.real.emptyRow" class="same">Identique au plan ✓</p>
        <template v-else-if="!info.real.emptyRow">
          <div class="line">
            <span class="arrow">⬅</span>
            <template v-if="info.real.before">
              <CoverImage :urls="info.real.before.coverUrls" :photo="info.real.before.coverPhoto" :label="info.real.before.title" :size="32" />
              <span class="grow text">{{ name(info.real.before) }}</span>
            </template>
            <span v-else class="grow text muted">
              Début de rangée<template v-if="info.real.nearestBefore">
                (plus proche : « {{ name(info.real.nearestBefore.cd) }} », {{ info.real.nearestBefore.slot }})</template>
            </span>
          </div>
          <div class="line">
            <span class="arrow">➡</span>
            <template v-if="info.real.after">
              <CoverImage :urls="info.real.after.coverUrls" :photo="info.real.after.coverPhoto" :label="info.real.after.title" :size="32" />
              <span class="grow text">{{ name(info.real.after) }}</span>
            </template>
            <span v-else class="grow text muted">
              Fin de rangée<template v-if="info.real.nearestAfter">
                (plus proche : « {{ name(info.real.nearestAfter.cd) }} », {{ info.real.nearestAfter.slot }})</template>
            </span>
          </div>
        </template>
        <p class="instruction">{{ instruction }}</p>
        <p v-if="info.real.gapBefore.count" class="small gap">
          ⬅ {{ info.real.gapBefore.count }} CD encore à venir à sa gauche : laisse environ {{ cm(info.real.gapBefore.mm) }} cm.
        </p>
        <p v-if="info.real.gapAfter.count" class="small gap">
          ➡ {{ info.real.gapAfter.count }} CD encore à venir à sa droite : laisse environ {{ cm(info.real.gapAfter.mm) }} cm.
        </p>
      </div>

      <!-- Progression -->
      <div class="block progress small">
        <div class="row">
          <span class="grow"><strong>{{ info.progress.total.done }} / {{ info.progress.total.all }}</strong> CD rangés</span>
          <span>{{ pct(info.progress.total) }} %</span>
        </div>
        <progress :value="info.progress.total.done" :max="info.progress.total.all || 1"></progress>
        <span class="muted">
          {{ parts?.furniture }} : {{ info.progress.furniture.done }} / {{ info.progress.furniture.all }} ·
          cette rangée : {{ info.progress.row.done }} / {{ info.progress.row.all }}
        </span>
      </div>
    </template>

    <!-- Actions, toujours visibles en bas de l'écran -->
    <div class="actions">
      <template v-if="!cd.shelvedAt">
        <button class="btn btn-primary btn-big" :disabled="!info" @click="shelve">✓ Rangé</button>
        <button class="btn" @click="emit('close')">Annuler</button>
      </template>
      <template v-else>
        <button class="btn btn-primary btn-big" @click="emit('close')">{{ doneLabel ?? 'OK' }}</button>
        <button class="btn" @click="unshelve">Annuler le rangement</button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.where-card {
  border-left: 8px solid var(--theme);
  background: var(--surface);
  border-radius: var(--radius);
  padding: 12px;
}
.head {
  flex-wrap: nowrap;
  align-items: flex-start;
}
.theme-name {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--theme);
}
.block {
  border-top: 1px solid var(--border);
  padding-top: 8px;
}
h3 {
  margin: 0 0 6px;
  font-size: 0.85rem;
  color: var(--muted);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.target {
  background: var(--surface-2);
  border: 0;
  border-radius: 10px;
  padding: 10px 12px;
}
.big {
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1.25;
}
.lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
}
.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.9rem;
}
.lines li.me .line {
  background: var(--surface-2);
  outline: 2px solid var(--theme);
  border-radius: 6px;
  padding: 2px 4px;
  font-weight: 700;
}
.other {
  display: block;
  margin-top: 4px;
}
.arrow {
  width: 20px;
  text-align: center;
}
.same {
  margin: 0;
  color: var(--ok);
  font-weight: 700;
}
.instruction {
  margin: 6px 0 0;
  font-weight: 700;
  font-size: 1.05rem;
}
.gap {
  margin: 4px 0 0;
  color: var(--warn);
}
.progress progress {
  width: 100%;
}
.actions {
  position: sticky;
  bottom: calc(var(--nav-height) + 8px + env(safe-area-inset-bottom));
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 8px;
  padding-top: 8px;
  background: var(--surface);
}
</style>
