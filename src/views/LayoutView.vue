<script setup lang="ts">
import { computed, ref } from 'vue'
import FurnitureDiagram from '../components/FurnitureDiagram.vue'
import { buildPlan } from '../classification/engine'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db, itemsOf } from '../db/database'
import type { ArtistInfo, Cd } from '../db/types'
import { furnitureFor, furnitureWarnings } from '../layout/furniture'
import { itemLabel } from '../lib/media'
import { useMedia } from '../composables/useMedia'
import { applyLayout, computeLayout, countMoves, insertionFor, placeCd } from '../services/layout'
import { layoutAppliedAtFor, layoutOptionsFor, layoutOptionsKey, rulesFor, saveSetting, settings } from '../services/settings'

// Écran « Rangement » : répartition des objets de l'univers en cours dans ses meubles, case par case.

const { media, w } = useMedia()
const cds = useLiveQuery(() => itemsOf(media.value), [] as Cd[])
const artistInfos = useLiveQuery(
  async () => new Map((await db.artists.toArray()).map((a) => [a.mbArtistId, a])),
  new Map<string, ArtistInfo>(),
)

// Classement puis répartition, recalculés à chaque changement (collection, règles, meubles, options).
const plan = computed(() => buildPlan(cds.value, rulesFor(media.value), artistInfos.value))
const layout = computed(() => computeLayout(plan.value, media.value))
/** Les meubles (ou parties de meubles) de cet univers. */
const myFurniture = computed(() => furnitureFor(settings.furniture, media.value))
const appliedAtMs = computed(() => layoutAppliedAtFor(media.value))
const moves = computed(() => countMoves(layout.value, cds.value))

const meters = (mm: number) => (mm / 1000).toFixed(1).replace('.', ',')
const fillPct = computed(() => Math.round((layout.value.neededMm / Math.max(1, layout.value.capacityMm)) * 100))
const appliedAt = computed(() =>
  appliedAtMs.value
    ? new Date(appliedAtMs.value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : null,
)

// --- Options ---
// Propres à cet univers : changer la marge des jeux ne touche pas au plan des CD.
const options = computed(() => layoutOptionsFor(media.value))
const margin = ref(options.value.marginPct)
function saveMargin() {
  const m = Math.min(300, Math.max(0, Math.round(Number(margin.value) || 0)))
  margin.value = m
  void saveSetting(layoutOptionsKey(media.value), { ...options.value, marginPct: m })
}
function setNewSlot(v: boolean) {
  void saveSetting(layoutOptionsKey(media.value), { ...options.value, themeStartsNewSlot: v })
}

// --- Rangée sélectionnée (détail des CD) ---
const selected = ref<string>()
const selectedContent = computed(() => layout.value.slots.find((s) => s.slot.id === selected.value))
function select(id: string) {
  selected.value = selected.value === id ? undefined : id
}
const themeColor = (cd: Cd) => {
  const p = plan.value.placement.get(cd.id)
  return plan.value.themes.find((t) => t.theme.id === p?.themeId)?.theme.color ?? '#999'
}

// --- Nouveaux CD à glisser à leur place (sans tout recalculer) ---
const toInsert = computed(() => {
  if (!appliedAtMs.value) return []
  return cds.value
    .filter((cd) => !cd.location)
    .slice(0, 30)
    .map((cd) => ({ cd, ins: insertionFor(cd, plan.value, cds.value) }))
})
const unplacedCount = computed(() => cds.value.filter((cd) => !cd.location).length)
const neighbour = (cd: Cd | undefined) => (cd ? itemLabel(cd) : '')

// --- Application ---
const applying = ref(false)
const message = ref('')
async function apply() {
  applying.value = true
  try {
    await applyLayout(plan.value, layout.value, media.value)
    message.value = `Rangement appliqué : chaque ${w.value.one} connaît maintenant son emplacement.`
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <main class="page stack">
    <div class="row">
      <h1 class="grow">Rangement</h1>
      <RouterLink class="btn btn-small" to="/rangement/meubles">🪑 Mes meubles</RouterLink>
    </div>

    <p v-if="!cds.length" class="notice">Scanne d'abord des {{ w.many }} : la répartition se calcule à partir de ta collection.</p>

    <template v-else>
      <section class="card stack">
        <p class="small summary">
          <strong>{{ plan.cdCount }} {{ plan.cdCount > 1 ? w.many : w.one }}</strong> · {{ meters(layout.neededMm) }} m de {{ w.many }} pour
          {{ meters(layout.capacityMm) }} m de rangées ({{ fillPct }} %) · calculé en {{ layout.durationMs }} ms
        </p>
        <div class="form-grid">
          <label class="field">
            Marge de croissance (place libre gardée dans chaque rangée, en %)
            <input v-model.number="margin" type="number" min="0" max="300" @change="saveMargin" />
          </label>
          <label class="row small checkbox">
            <input
              type="checkbox"
              :checked="options.themeStartsNewSlot"
              @change="setNewSlot(($event.target as HTMLInputElement).checked)"
            />
            Chaque thème commence dans une nouvelle rangée
          </label>
        </div>

        <div v-if="layout.overflow.length" class="notice notice-danger small">
          <strong>Surcharge :</strong> {{ layout.overflow.length }} {{ w.many }} sans place.
        </div>
        <ul v-if="layout.suggestions.length" class="suggestions small">
          <li v-for="s in layout.suggestions" :key="s">{{ s }}</li>
        </ul>

        <p class="small">
          <template v-if="!appliedAt">Ce rangement n'a pas encore été appliqué.</template>
          <template v-else-if="moves.total">
            Depuis le dernier rangement appliqué ({{ appliedAt }}) :
            <template v-if="moves.added"><br />· {{ moves.added }} nouveau(x) {{ w.many }} à placer ;</template>
            <template v-if="moves.otherRow"><br />· <strong>{{ moves.otherRow }} {{ w.many }} à changer de rangée</strong> ;</template>
            <template v-if="moves.shifted"><br />· {{ moves.shifted }} {{ w.many }} qui glissent simplement d'une place dans leur rangée ;</template>
            <template v-if="moves.removed"><br />· {{ moves.removed }} {{ w.many }} qui n'auraient plus de place.</template>
            <template v-if="moves.shelvedKept || moves.shelvedToMove">
              <br />Parmi tes {{ w.many }} déjà rangés : <strong>{{ moves.shelvedKept }} restent en place</strong>,
              <strong>{{ moves.shelvedToMove }} sont à déplacer</strong> (ils repasseront « à ranger »).
            </template>
            <template v-if="moves.otherRow">
              <br /><span class="muted">
                Inutile de tout réappliquer pour quelques nouveaux {{ w.many }} : la marge laisse de la place dans chaque rangée,
                il suffit de les glisser à leur place (l'étape 4 t'indiquera où, sans rien recalculer).
              </span>
            </template>
          </template>
          <template v-else>✓ Le rangement appliqué est à jour.</template>
        </p>
        <button class="btn btn-primary btn-big" :disabled="applying || (!!appliedAt && !moves.total)" @click="apply">
          ✓ Appliquer ce rangement
        </button>
        <p class="small muted">Appliquer le rangement applique aussi le classement (thèmes) affiché dans l'onglet Classement.</p>
        <p v-if="message" class="notice notice-ok small" role="status">{{ message }}</p>
      </section>

      <section class="row">
        <RouterLink class="btn" to="/imprimer/plan">🖨️ Plan imprimable (PDF)</RouterLink>
        <RouterLink class="btn" to="/imprimer/etiquettes">🏷️ Étiquettes intercalaires</RouterLink>
        <RouterLink class="btn" :to="{ name: 'scan', query: { mode: 'ranger' } }">📦 Ranger avec le scanner</RouterLink>
        <RouterLink class="btn" to="/sans-code">{{ w.icon }} {{ w.many.charAt(0).toUpperCase() + w.many.slice(1) }} sans code-barres</RouterLink>
        <RouterLink class="btn" to="/ou-est">🔍 Où est ce {{ w.one }} ?</RouterLink>
      </section>

      <section v-if="toInsert.length" class="card stack">
        <h2 class="insert-title">Nouveaux {{ w.many }} à ranger ({{ unplacedCount }})</h2>
        <p class="small muted">
          Sans rien recalculer : glisse chaque {{ w.one }} à la place indiquée (ses voisins de droite se décalent d'une place),
          puis appuie sur « C'est rangé ».
        </p>
        <ul class="plain inserts">
          <li v-for="x in toInsert" :key="x.cd.id" class="stack">
            <RouterLink :to="{ name: 'cd', params: { id: x.cd.id } }"><strong>{{ neighbour(x.cd) }}</strong></RouterLink>
            <template v-if="x.ins">
              <span class="small">
                📍 {{ x.ins.slot.label }}, place n° {{ x.ins.position }}
                <template v-if="x.ins.after"><br />juste après « {{ neighbour(x.ins.after) }} »</template>
                <template v-if="x.ins.before"><br />juste avant « {{ neighbour(x.ins.before) }} »</template>
              </span>
              <span v-if="!x.ins.fits" class="small notice notice-warn">
                Cette rangée est pleine : pousse le dernier {{ w.one }} de la rangée au début de la suivante, ou réapplique le
                rangement complet si beaucoup de {{ w.many }} se sont ajoutés.
              </span>
              <button class="btn btn-small" @click="placeCd(x.cd, x.ins, plan)">✓ C'est rangé</button>
            </template>
            <span v-else class="small muted">Pas de voisin rangé : applique le rangement complet.</span>
          </li>
        </ul>
      </section>

      <!-- Légende : où commence et où finit chaque thème -->
      <section class="card">
        <h2 class="legend-title">Thèmes dans les meubles</h2>
        <ul class="legend">
          <li v-for="r in layout.themeRanges" :key="r.theme.id">
            <span class="dot" :style="{ background: r.theme.color }"></span>
            <span class="grow">
              <strong>{{ r.theme.name }}</strong> <span class="muted">({{ r.cdCount }} {{ r.cdCount > 1 ? w.many : w.one }})</span><br />
              <span class="small muted">
                {{ layout.slots[r.from].slot.label }}<template v-if="r.to !== r.from"> → {{ layout.slots[r.to].slot.label }}</template>
              </span>
            </span>
          </li>
        </ul>
      </section>

      <!-- Les meubles -->
      <p v-if="!myFurniture.length" class="notice notice-warn">
        Aucun meuble n'est attribué aux {{ w.many }} : choisis l'univers d'un meuble (ou de quelques niveaux) dans
        <RouterLink to="/rangement/meubles">Mes meubles</RouterLink>.
      </p>
      <section v-if="layout.tooTall.length" class="card stack">
        <h2 class="legend-title">Trop hauts pour leur étagère ({{ layout.tooTall.length }})</h2>
        <p class="small muted">
          Ces {{ w.many }} ne tiennent pas debout à l'endroit prévu. Remonte la tablette (puis corrige sa hauteur utile dans
          « Mes meubles »), ou corrige la hauteur de l'objet sur sa fiche si elle est fausse.
        </p>
        <ul class="small plain">
          <li v-for="t in layout.tooTall.slice(0, 50)" :key="t.cd.id">
            <RouterLink :to="{ name: 'cd', params: { id: t.cd.id } }">{{ neighbour(t.cd) }}</RouterLink> :
            {{ String(t.heightCm).replace('.', ',') }} cm pour {{ String(t.shelfCm).replace('.', ',') }} cm ({{ t.slotLabel }})
          </li>
        </ul>
      </section>

      <section v-for="f in myFurniture" :key="f.id" class="stack">
        <h2>{{ f.name }}</h2>
        <p v-for="w in furnitureWarnings(f)" :key="w" class="small muted warn">⚠️ {{ w }}</p>
        <FurnitureDiagram :furniture="f" :slots="layout.slots" :selected="selected" @select="select" />
        <div v-if="selectedContent && selectedContent.slot.furnitureId === f.id" class="card detail">
          <div class="row">
            <strong class="grow">{{ selectedContent.slot.label }}</strong>
            <button class="btn btn-small" @click="selected = undefined">Fermer</button>
          </div>
          <p class="small muted">
            {{ selectedContent.cds.length }} {{ selectedContent.cds.length > 1 ? w.many : w.one }} · {{ Math.round(selectedContent.usedMm / 10) }} cm occupés sur
            {{ Math.round(selectedContent.slot.capacityMm / 10) }} cm · de gauche à droite :
          </p>
          <ol class="small cds">
            <li v-for="cd in selectedContent.cds" :key="cd.id">
              <span class="dot" :style="{ background: themeColor(cd) }"></span>
              <RouterLink :to="{ name: 'cd', params: { id: cd.id } }">
                {{ neighbour(cd) }}
              </RouterLink>
              <span v-if="cd.year" class="muted"> ({{ cd.year }})</span>
            </li>
          </ol>
        </div>
      </section>

      <details v-if="layout.cuts.length" class="card">
        <summary><strong>{{ layout.cuts.length }} {{ media === 'cd' ? 'artiste(s)' : `${w.creator}(s)` }} sur plusieurs rangées</strong></summary>
        <ul class="small plain">
          <li v-for="c in layout.cuts" :key="c.label + c.slotLabels[0]">
            <strong>{{ c.label }}</strong> : {{ c.slotLabels.join(' → ') }}
          </li>
        </ul>
      </details>

      <details v-if="layout.overflow.length" class="card">
        <summary><strong>{{ layout.overflow.length }} {{ w.many }} sans place</strong></summary>
        <ul class="small plain">
          <li v-for="cd in layout.overflow" :key="cd.id">{{ neighbour(cd) }}</li>
        </ul>
      </details>
    </template>
  </main>
</template>

<style scoped>
.summary {
  margin: 0;
}
.checkbox {
  align-self: end;
  min-height: 44px;
}
.suggestions {
  margin: 0;
  padding: 10px 12px 10px 28px;
  border-radius: 10px;
  background: var(--info-bg);
}
.legend-title {
  margin-top: 0;
}
.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.legend li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex: none;
  margin-top: 4px;
}
.warn {
  margin: 0;
}
.detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cds {
  margin: 0;
  padding-left: 28px;
}
.cds li {
  margin: 3px 0;
}
.cds .dot {
  margin: 0 6px 0 0;
  vertical-align: middle;
}
.insert-title {
  margin-top: 0;
}
.inserts li {
  gap: 4px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
}
.inserts .btn {
  align-self: flex-start;
}
.plain {
  margin: 8px 0 0;
  padding-left: 18px;
}
h2 {
  margin-bottom: 0;
}
</style>
