<script setup lang="ts">
import { computed, ref } from 'vue'
import { buildPlan, type PlanArtist, type PlanTheme } from '../classification/engine'
import { UNCLASSIFIED } from '../classification/themes'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db } from '../db/database'
import type { ArtistInfo, Cd } from '../db/types'
import { normalizeText } from '../lib/text'
import {
  applyPlan,
  cdsWithoutDiscogs,
  cdsWithoutReleaseDetails,
  artistsToCheckSortName,
  completeCollection,
  completion,
  countChanges,
  missingArtistIds,
  setOverride,
} from '../services/classification'
import { settings } from '../services/settings'

// Écran « Classement » : l'appli propose un plan (thème → artiste → albums), tu l'ajustes, puis tu l'appliques.

const cds = useLiveQuery(() => db.cds.toArray(), [] as Cd[])
const artistInfos = useLiveQuery(
  async () => new Map((await db.artists.toArray()).map((a) => [a.mbArtistId, a])),
  new Map<string, ArtistInfo>(),
)
const missingArtists = useLiveQuery(async () => (await missingArtistIds()).length, 0)
// Dépend du jeton Discogs : relu à chaque changement de la base (et donc des réglages).
const missingDiscogs = useLiveQuery(async () => (await cdsWithoutDiscogs()).length, 0)
const missingDetails = useLiveQuery(async () => (await cdsWithoutReleaseDetails()).length, 0)
const missingSorts = useLiveQuery(async () => (await artistsToCheckSortName()).length, 0)
const toComplete = computed(
  () => missingArtists.value + missingDiscogs.value + missingDetails.value + missingSorts.value,
)

// Le plan est recalculé automatiquement à chaque changement de la collection ou des règles.
const plan = computed(() => buildPlan(cds.value, settings.classification, artistInfos.value))
const changes = computed(() => countChanges(plan.value, cds.value))
const themes = computed(() => settings.classification.themes)
const realThemes = computed(() => plan.value.themes.filter((t) => t.theme.id !== UNCLASSIFIED))

const appliedAt = computed(() =>
  settings.classificationAppliedAt
    ? new Date(settings.classificationAppliedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : null,
)

// --- Recherche d'un artiste dans le plan ---
const search = ref('')
function visibleArtists(t: PlanTheme): PlanArtist[] {
  const q = normalizeText(search.value)
  if (!q) return t.artists
  return t.artists.filter((a) => normalizeText(`${a.name} ${a.cds.map((c) => c.title).join(' ')}`).includes(q))
}

// --- Thèmes dépliés ---
const open = ref(new Set<string>())
const showOrder = ref(new Set<string>())
function toggle(set: Set<string>, id: string) {
  if (set.has(id)) set.delete(id)
  else set.add(id)
}
const isOpen = (id: string) => open.value.has(id) || !!search.value.trim()

// --- Changer le thème d'un artiste ---
async function choose(a: PlanArtist, value: string) {
  await setOverride(a.key, a.isCompilation, value || null)
}
const themeName = (id: string) =>
  id === UNCLASSIFIED ? 'À classer' : (themes.value.find((t) => t.id === id)?.name ?? id)

// --- Application ---
const applying = ref(false)
const message = ref('')
async function apply() {
  applying.value = true
  try {
    await applyPlan(plan.value)
    message.value = `Classement appliqué à ${plan.value.cdCount} CD.`
  } finally {
    applying.value = false
  }
}

/** Libellé d'un CD selon l'ordre du thème (artiste, titre ou compositeur), pour l'en-tête « premier → dernier ». */
function cdLabel(t: PlanTheme, cd: Cd | undefined): string {
  if (!cd) return ''
  if (t.theme.sortBy === 'titre') return cd.title
  if (t.theme.sortBy === 'compositeur') return cd.composer || cd.artist
  return cd.isCompilation ? cd.title : cd.artist
}

const PHASES: Record<string, string> = {
  noms: 'Noms de tri des artistes (MusicBrainz)',
  editions: 'Langue et type des albums (MusicBrainz)',
  artistes: 'Fiches des artistes (MusicBrainz)',
  discogs: 'Styles des CD (Discogs)',
  '': '',
}

const etaMinutes = computed(() => Math.max(1, Math.ceil((toComplete.value * 1.1) / 60)))
</script>

<template>
  <main class="page stack">
    <div class="row">
      <h1 class="grow">Classement</h1>
      <RouterLink class="btn btn-small" to="/classement/themes">⚙️ Thèmes et règles</RouterLink>
    </div>

    <p v-if="!cds.length" class="notice">Scanne d'abord quelques CD : le classement se calcule à partir de ta collection.</p>

    <template v-else>
      <!-- Résumé -->
      <section class="card stack">
        <p class="small muted summary">
          {{ plan.cdCount }} CD · {{ realThemes.length }} thèmes · calculé en {{ plan.durationMs }} ms
          <template v-if="appliedAt"> · dernier classement appliqué le {{ appliedAt }}</template>
        </p>
        <div class="bar" aria-hidden="true">
          <span
            v-for="t in plan.themes"
            :key="t.theme.id"
            :style="{ background: t.theme.color, flexGrow: t.cds.length }"
            :title="`${t.theme.name} : ${t.cds.length} CD`"
          ></span>
        </div>
        <p v-if="changes.theme || changes.order || !appliedAt" class="small">
          <template v-if="!appliedAt">Ce classement n'a pas encore été appliqué.</template>
          <template v-else>
            {{ changes.theme }} CD changeraient de thème<template v-if="changes.order">, {{ changes.order }} de place</template>.
          </template>
        </p>
        <p v-else class="small muted">✓ Le classement appliqué est à jour.</p>
        <button
          class="btn btn-primary btn-big"
          :disabled="applying || (!!appliedAt && !changes.theme && !changes.order)"
          @click="apply"
        >
          ✓ Appliquer ce classement
        </button>
        <p v-if="message" class="notice notice-ok small" role="status">{{ message }}</p>
      </section>

      <!-- Points d'attention -->
      <section v-if="plan.unclassified.length" class="notice notice-warn stack">
        <strong>{{ plan.unclassified.length }} artiste(s) sans genre connu</strong>
        <span class="small">
          Ils sont dans « À classer » (en fin de liste). Choisis leur thème ci-dessous, ou laisse l'appli chercher les
          genres des artistes sur MusicBrainz.
        </span>
      </section>
      <section v-if="toComplete || completion.running" class="card stack">
        <template v-if="completion.running">
          <p class="small">
            {{ PHASES[completion.phase] }} :
            {{ completion.done }} / {{ completion.total }}
          </p>
          <progress :value="completion.done" :max="completion.total || 1"></progress>
          <button class="btn btn-small" @click="completion.cancelled = true">Arrêter</button>
        </template>
        <template v-else>
          <p class="small">
            Pour un classement plus juste, l'appli peut compléter ta collection :
            <template v-if="missingSorts"><br />· {{ missingSorts }} artiste(s) au nom de tri à vérifier (ex. « Joan Baez » au lieu de « Baez, Joan ») ;</template>
            <template v-if="missingDetails"><br />· {{ missingDetails }} CD sans langue des textes ni type d'album (scannés avant la mise à jour) ;</template>
            <template v-if="missingArtists"><br />· {{ missingArtists }} fiche(s) d'artiste MusicBrainz (genres, pays → artistes français) ;</template>
            <template v-if="missingDiscogs"><br />· {{ missingDiscogs }} CD sans styles Discogs (recherche par artiste + titre).</template>
            <br />Durée : environ {{ etaMinutes }} min. Tu peux continuer à utiliser l'appli pendant ce temps.
          </p>
          <button class="btn" @click="completeCollection">🔎 Compléter ma collection</button>
        </template>
        <p v-if="completion.errors" class="small muted">{{ completion.errors }} élément(s) non récupéré(s).</p>
        <details v-if="completion.sortChanges.length" class="small">
          <summary>{{ completion.sortChanges.length }} nom(s) de tri corrigé(s)</summary>
          <ul>
            <li v-for="c in completion.sortChanges" :key="c">{{ c }}</li>
          </ul>
          <p class="muted">Un nom ne te convient pas ? Corrige le champ « Nom de tri » sur la fiche d'un de ses CD.</p>
        </details>
      </section>

      <details v-if="plan.disputed.length" class="card">
        <summary>
          <strong>{{ plan.disputed.length }} artiste(s) à cheval sur plusieurs thèmes</strong>
          <span class="muted small"> — vérifie que le thème choisi te convient</span>
        </summary>
        <ul class="plain">
          <li v-for="a in plan.disputed" :key="a.key" class="small">
            <strong>{{ a.name }}</strong> → {{ themeName(a.themeId) }} ({{ Math.round(a.agreement * 100) }} %)
            <span class="muted">
              · aussi : {{ a.alternatives.map((x) => `${themeName(x.themeId)} ${Math.round(x.share * 100)} %`).join(', ') }}
            </span>
          </li>
        </ul>
      </details>

      <details v-if="plan.merges.length" class="card">
        <summary>
          <strong>{{ plan.merges.length }} thème(s) regroupé(s) automatiquement</strong>
        </summary>
        <ul class="plain">
          <li v-for="m in plan.merges" :key="m.from.id" class="small">
            {{ m.from.name }} ({{ m.count }} CD) → {{ m.into.name }} <span class="muted">— {{ m.reason }}</span>
          </li>
        </ul>
        <p class="small muted">Tu peux changer ces seuils ou le thème parent dans « Thèmes et règles ».</p>
      </details>

      <!-- Le plan -->
      <input v-model="search" type="search" placeholder="Chercher un artiste ou un album dans le plan…" aria-label="Chercher" />

      <section v-for="t in plan.themes" :key="t.theme.id" class="theme" :style="{ '--theme': t.theme.color }">
        <button class="theme-head" :aria-expanded="isOpen(t.theme.id)" @click="toggle(open, t.theme.id)">
          <span class="swatch"></span>
          <span class="grow">
            <strong>{{ t.theme.name }}</strong><br />
            <span class="small muted">
              {{ t.cds.length }} CD · {{ t.artists.length }} artiste{{ t.artists.length > 1 ? 's' : '' }}
              · {{ cdLabel(t, t.cds[0]) }}<template v-if="cdLabel(t, t.cds.at(-1)) !== cdLabel(t, t.cds[0])"> → {{ cdLabel(t, t.cds.at(-1)) }}</template>
            </span>
          </span>
          <span aria-hidden="true">{{ isOpen(t.theme.id) ? '▾' : '▸' }}</span>
        </button>

        <div v-if="isOpen(t.theme.id)" class="theme-body">
          <button class="btn btn-small" @click="toggle(showOrder, t.theme.id)">
            {{ showOrder.has(t.theme.id) ? 'Voir les artistes' : `Voir l'ordre de rangement des ${t.cds.length} CD` }}
          </button>

          <ol v-if="showOrder.has(t.theme.id)" class="order small">
            <li v-for="cd in t.cds" :key="cd.id">
              <strong>{{ t.theme.sortBy === 'compositeur' ? cd.composer || cd.artistSort : cd.artistSort }}</strong>
              — {{ cd.title }}<template v-if="cd.year"> ({{ cd.year }})</template>
            </li>
          </ol>

          <ul v-else class="artists">
            <li v-for="a in visibleArtists(t)" :key="a.key" class="artist">
              <div class="grow">
                <div>
                  <strong>{{ a.name }}</strong>
                  <span v-if="a.personal" class="muted small"> · compilation perso</span>
                  <span class="muted small"> · {{ a.cds.length }} CD</span>
                  <span v-if="a.forced" class="badge badge-info">forcé</span>
                  <span v-else-if="!a.isCompilation && a.cds.length > 1 && a.agreement < 0.6" class="badge badge-warn">
                    à cheval
                  </span>
                </div>
                <div class="small muted">
                  {{ a.reason }}<template v-if="a.initialThemeId !== a.themeId">
                    · regroupé depuis {{ themeName(a.initialThemeId) }}</template>
                </div>
                <div class="small muted albums">
                  {{ a.cds.map((c) => (c.year ? `${c.title} (${c.year})` : c.title)).join(' · ') }}
                </div>
              </div>
              <select
                class="choose"
                :value="a.forced ? a.themeId : ''"
                :aria-label="`Thème de ${a.name}`"
                @change="choose(a, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Auto</option>
                <option v-for="th in themes" :key="th.id" :value="th.id">{{ th.name }}</option>
              </select>
            </li>
          </ul>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.summary {
  margin: 0;
}
.bar {
  display: flex;
  height: 14px;
  border-radius: 7px;
  overflow: hidden;
  gap: 2px;
}
.bar span {
  min-width: 4px;
}
progress {
  width: 100%;
}
.plain {
  margin: 8px 0 0;
  padding-left: 18px;
}
.plain li {
  margin: 4px 0;
}
.theme {
  border: 1px solid var(--border);
  border-left: 6px solid var(--theme);
  border-radius: var(--radius);
  background: var(--surface);
}
.theme-head {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.swatch {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: var(--theme);
  flex: none;
}
.theme-body {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.artists {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
}
.artist {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid var(--border);
}
.albums {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.artist .grow {
  min-width: 0;
}
.choose {
  width: auto;
  max-width: 40%;
  min-height: 36px;
  padding: 4px 8px;
  font-size: 0.875rem;
}
.order {
  margin: 0;
  padding-left: 28px;
}
.order li {
  margin: 2px 0;
}
.badge {
  margin-left: 6px;
}
</style>
