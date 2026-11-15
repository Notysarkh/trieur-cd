<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { buildPlan } from '../classification/engine'
import {
  THEME_COLORS,
  mergeThemeInto,
  themeIdFromName,
  type ClassificationRules,
  type ThemeDef,
  type ThemeSort,
} from '../classification/themes'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db } from '../db/database'
import { mediaInfo, mediaOf } from '../lib/media'
import type { ArtistInfo, Cd } from '../db/types'
import { normalizeText } from '../lib/text'
import { moveCdThemeChoices, resetRules, saveRules } from '../services/classification'
import { currentMedia, rulesFor } from '../services/settings'

// Écran « Thèmes et règles » : renommer, réordonner, fusionner, scinder les thèmes,
// régler les regroupements automatiques et gérer les artistes forcés.
// Chaque modification est enregistrée immédiatement et le plan se met à jour.

// Les règles de l'univers en cours (CD ou livres).
const media = currentMedia()
const info = mediaInfo(media)
const isCd = media === 'cd'

/** Copie de travail des règles. */
const rules = reactive<ClassificationRules>(JSON.parse(JSON.stringify(rulesFor(media))))
watch(
  () => rulesFor(media),
  (r) => Object.assign(rules, JSON.parse(JSON.stringify(r))),
)
function commit() {
  return saveRules(JSON.parse(JSON.stringify(rules)), media)
}

// Le plan actuel sert à afficher le nombre de CD par thème et les styles présents (pour scinder).
const all = useLiveQuery(() => db.cds.toArray(), [] as Cd[])
const cds = computed(() => all.value.filter((c) => mediaOf(c) === media))
const artistInfos = useLiveQuery(
  async () => new Map((await db.artists.toArray()).map((a) => [a.mbArtistId, a])),
  new Map<string, ArtistInfo>(),
)
const plan = computed(() => buildPlan(cds.value, rulesFor(media), isCd ? artistInfos.value : new Map()))
const countByTheme = computed(() => new Map(plan.value.themes.map((t) => [t.theme.id, t.cds.length])))
const artistNames = computed(() => {
  const m = new Map<string, string>()
  for (const t of plan.value.themes) for (const a of t.artists) m.set(a.key, a.name)
  return m
})

const open = ref<string | null>(null)
const nameOf = (id: string | undefined) => rules.themes.find((t) => t.id === id)?.name ?? '—'

// --- Ordre ---
function move(index: number, delta: number) {
  const j = index + delta
  if (j < 0 || j >= rules.themes.length) return
  const [t] = rules.themes.splice(index, 1)
  rules.themes.splice(j, 0, t)
  void commit()
}

// --- Mots-clés ---
const newKeyword = ref('')
function addKeyword(t: ThemeDef) {
  const k = normalizeText(newKeyword.value)
  if (k && !t.keywords.includes(k)) {
    t.keywords.push(k)
    void commit()
  }
  newKeyword.value = ''
}
function removeKeyword(t: ThemeDef, k: string) {
  t.keywords = t.keywords.filter((x) => x !== k)
  void commit()
}

// --- Fusion : le thème disparaît, ses mots-clés et ses artistes forcés passent dans la cible ---
const mergeTarget = ref('')
function merge(source: ThemeDef) {
  const target = rules.themes.find((t) => t.id === mergeTarget.value)
  if (!target || target.id === source.id) return
  if (!window.confirm(`Fusionner « ${source.name} » dans « ${target.name} » ?`)) return
  mergeThemeInto(rules, source.id, target.id)
  void moveCdThemeChoices(source.id, target.id)
  open.value = target.id
  mergeTarget.value = ''
  void commit()
}

// --- Scinder : un nouveau thème reprend certains styles du thème actuel ---
const splitName = ref('')
const splitTags = ref<string[]>([])
/** Les genres/styles présents dans les CD de ce thème, du plus fréquent au moins fréquent. */
function tagsOf(themeId: string): { tag: string; count: number }[] {
  const t = plan.value.themes.find((x) => x.theme.id === themeId)
  const counts = new Map<string, number>()
  for (const cd of t?.cds ?? []) {
    for (const tag of new Set([...cd.genres, ...cd.styles].map(normalizeText))) {
      if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count)
}

/** Refuse un nom déjà utilisé par un autre thème. */
function nameTaken(name: string): boolean {
  const taken = rules.themes.some((t) => normalizeText(t.name) === normalizeText(name))
  if (taken) window.alert(`Un thème « ${name} » existe déjà.`)
  return taken
}

function split(source: ThemeDef, index: number) {
  const name = splitName.value.trim()
  if (!name || !splitTags.value.length || nameTaken(name)) return
  const theme: ThemeDef = {
    id: themeIdFromName(name, rules.themes.map((t) => t.id)),
    name,
    color: THEME_COLORS[rules.themes.length % THEME_COLORS.length],
    keywords: [...splitTags.value],
    sortBy: 'artiste',
    // Pas de thème parent : tu viens de le créer, il ne doit pas disparaître dans un regroupement automatique.
  }
  source.keywords = source.keywords.filter((k) => !splitTags.value.includes(k))
  rules.themes.splice(index + 1, 0, theme)
  splitName.value = ''
  splitTags.value = []
  open.value = theme.id
  void commit()
}

// --- Ajouter / supprimer ---
const newThemeName = ref('')
function addTheme() {
  const name = newThemeName.value.trim()
  if (!name || nameTaken(name)) return
  rules.themes.push({
    id: themeIdFromName(name, rules.themes.map((t) => t.id)),
    name,
    color: THEME_COLORS[rules.themes.length % THEME_COLORS.length],
    keywords: [],
    sortBy: 'artiste',
  })
  newThemeName.value = ''
  void commit()
}
function remove(t: ThemeDef) {
  if (!window.confirm(`Supprimer le thème « ${t.name} » ? Ses ${info.many} seront reclassés ailleurs (ou « À classer »).`)) return
  rules.themes = rules.themes.filter((x) => x.id !== t.id)
  for (const map of [rules.artistOverrides, rules.cdOverrides]) {
    for (const k of Object.keys(map)) if (map[k] === t.id) delete map[k]
  }
  for (const x of rules.themes) if (x.mergeInto === t.id) x.mergeInto = undefined
  void commit()
}

// --- Artistes forcés ---
const overrides = computed(() => [
  ...Object.entries(rules.artistOverrides).map(([key, themeId]) => ({ key, themeId, cd: false })),
  ...Object.entries(rules.cdOverrides).map(([key, themeId]) => ({ key, themeId, cd: true })),
])
function removeOverride(o: { key: string; cd: boolean }) {
  delete (o.cd ? rules.cdOverrides : rules.artistOverrides)[o.key]
  void commit()
}

async function reset() {
  if (window.confirm(`Revenir aux thèmes et règles par défaut ? Les choix forcés (${info.creators}) seront oubliés.`)) {
    await resetRules(media)
  }
}

const SORTS: Record<ThemeSort, string> = media === 'jeu'
  ? {
      artiste: 'Éditeur (A → Z), puis date',
      titre: 'Titre (A → Z)',
      compositeur: 'Compositeur (A → Z), puis date',
      serie: 'Titre (A → Z)',
    }
  : media === 'video'
  ? {
      artiste: 'Réalisateur (A → Z), puis date',
      titre: 'Titre (A → Z)',
      compositeur: 'Compositeur (A → Z), puis date',
      serie: 'Titre (A → Z) ; les saisons d’une série ensemble',
    }
  : isCd
  ? {
      artiste: 'Artiste (A → Z), puis albums par date',
      titre: 'Titre de l’album (A → Z)',
      compositeur: 'Compositeur (A → Z), puis date',
      serie: 'Série (A → Z), puis numéro',
    }
  : {
      artiste: 'Auteur (nom de famille, A → Z), puis date',
      titre: 'Titre (A → Z)',
      compositeur: 'Compositeur (A → Z), puis date',
      serie: 'Série (A → Z), puis tome ; albums isolés au nom de l’auteur',
    }
</script>

<template>
  <main class="page stack">
    <RouterLink to="/classement" class="small">← Retour au classement</RouterLink>
    <h1>Thèmes et règles <span class="muted small">· {{ info.icon }} {{ info.label }}</span></h1>

    <section class="card stack">
      <h2>Regroupements automatiques</h2>
      <div class="form-grid">
        <label class="field">
          Nombre maximum de thèmes
          <input v-model.number="rules.maxThemes" type="number" min="3" max="30" @change="commit" />
        </label>
        <label class="field">
          Minimum de {{ info.many }} par thème
          <input v-model.number="rules.minCdsPerTheme" type="number" min="0" max="100" @change="commit" />
        </label>
      </div>
      <p class="small muted">
        Un thème trop petit (ou en trop) est regroupé dans son « thème parent », choisi dans sa fiche ci-dessous. Les
        thèmes sans parent ne sont jamais regroupés.
      </p>
      <label v-if="isCd" class="row small">
        <input v-model="rules.frenchTheme" type="checkbox" @change="commit" />
        Thème « Musique française » : les artistes qui chantent en français y sont rangés, quel que soit leur genre (sauf
        classique, BO, enfants et compilations)
      </label>
    </section>

    <h2>Thèmes, dans l'ordre de rangement</h2>
    <p class="small muted">
      Cet ordre sera celui des meubles (de gauche à droite, de haut en bas). Les « mots-clés » sont les genres et styles
      qui mènent à un thème.
    </p>

    <ul class="themes">
      <li v-for="(t, i) in rules.themes" :key="t.id" class="card theme" :style="{ borderLeftColor: t.color }">
        <div class="row head">
          <input v-model="t.color" type="color" class="color" :aria-label="`Couleur de ${t.name}`" @change="commit" />
          <input v-model="t.name" class="grow name" :aria-label="`Nom du thème ${t.name}`" @change="commit" />
          <span class="muted small count">{{ countByTheme.get(t.id) ?? 0 }} {{ info.many }}</span>
          <button class="btn btn-small" :disabled="i === 0" aria-label="Monter" @click="move(i, -1)">↑</button>
          <button class="btn btn-small" :disabled="i === rules.themes.length - 1" aria-label="Descendre" @click="move(i, 1)">
            ↓
          </button>
          <button class="btn btn-small" :aria-expanded="open === t.id" @click="open = open === t.id ? null : t.id">
            {{ open === t.id ? 'Fermer' : 'Modifier' }}
          </button>
        </div>

        <div v-if="open === t.id" class="stack body">
          <div class="form-grid">
            <label class="field">
              Ordre des {{ info.many }} dans ce thème
              <select v-model="t.sortBy" @change="commit">
                <option v-for="(label, key) in SORTS" :key="key" :value="key">{{ label }}</option>
              </select>
            </label>
            <label class="field">
              Thème parent (si trop petit)
              <select :value="t.mergeInto ?? ''" @change="t.mergeInto = ($event.target as HTMLSelectElement).value || undefined; commit()">
                <option value="">Jamais regroupé</option>
                <option v-for="o in rules.themes.filter((x) => x.id !== t.id)" :key="o.id" :value="o.id">{{ o.name }}</option>
              </select>
            </label>
          </div>

          <div>
            <p class="small muted label">Mots-clés ({{ t.keywords.length }})</p>
            <p v-if="t.special === 'compilations'" class="small muted">
              Ce thème reçoit automatiquement les compilations multi-artistes.
            </p>
            <div class="chips-wrap">
              <span v-for="k in t.keywords" :key="k" class="kw">
                {{ k }}
                <button :aria-label="`Retirer ${k}`" @click="removeKeyword(t, k)">×</button>
              </span>
            </div>
            <form class="row add" @submit.prevent="addKeyword(t)">
              <input v-model="newKeyword" class="grow" placeholder="Ajouter un genre ou style (ex. shoegaze)" />
              <button class="btn btn-small" type="submit">Ajouter</button>
            </form>
          </div>

          <details>
            <summary class="small"><strong>Scinder ce thème</strong></summary>
            <p class="small muted">
              Coche les styles à sortir de « {{ t.name }} » et donne un nom au nouveau thème. Les artistes dont ces styles
              sont majoritaires y passeront.
            </p>
            <div class="chips-wrap">
              <label v-for="x in tagsOf(t.id)" :key="x.tag" class="kw pick">
                <input v-model="splitTags" type="checkbox" :value="x.tag" />
                {{ x.tag }} <span class="muted">({{ x.count }})</span>
              </label>
              <span v-if="!tagsOf(t.id).length" class="small muted">Aucun {{ info.one }} dans ce thème pour l'instant.</span>
            </div>
            <form class="row add" @submit.prevent="split(t, i)">
              <input v-model="splitName" class="grow" placeholder="Nom du nouveau thème (ex. Punk)" />
              <button class="btn btn-small" type="submit" :disabled="!splitName.trim() || !splitTags.length">Créer</button>
            </form>
          </details>

          <div class="row">
            <select v-model="mergeTarget" class="grow" :aria-label="`Fusionner ${t.name} dans…`">
              <option value="">Fusionner dans…</option>
              <option v-for="o in rules.themes.filter((x) => x.id !== t.id)" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
            <button class="btn btn-small" :disabled="!mergeTarget" @click="merge(t)">Fusionner</button>
            <button class="btn btn-small btn-danger" @click="remove(t)">Supprimer</button>
          </div>
        </div>
      </li>
    </ul>

    <form class="row" @submit.prevent="addTheme">
      <input v-model="newThemeName" class="grow" placeholder="Nom d'un nouveau thème" />
      <button class="btn" type="submit">+ Ajouter un thème</button>
    </form>

    <section class="card stack">
      <h2>Choix forcés : {{ info.creators }} ({{ overrides.length }})</h2>
      <p v-if="!overrides.length" class="small muted">
        Aucun. Dans l'écran Classement, choisis un thème dans la liste à côté d'un {{ isCd ? 'artiste' : 'auteur ou d’une série' }} pour le forcer.
      </p>
      <ul class="plain">
        <li v-for="o in overrides" :key="o.key" class="row small">
          <span class="grow">
            <strong>{{ artistNames.get(o.cd ? `cd:${o.key}` : o.key) ?? o.key }}</strong> → {{ nameOf(o.themeId) }}
          </span>
          <button class="btn btn-small" @click="removeOverride(o)">Annuler</button>
        </li>
      </ul>
    </section>

    <button class="btn btn-danger" @click="reset">Revenir aux réglages par défaut</button>
  </main>
</template>

<style scoped>
.themes {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.theme {
  border-left: 6px solid;
  padding: 10px;
}
.head {
  flex-wrap: nowrap;
}
.color {
  width: 36px;
  min-height: 36px;
  padding: 2px;
  flex: none;
}
.name {
  min-width: 0;
  font-weight: 600;
}
.count {
  white-space: nowrap;
}
.body {
  margin-top: 12px;
}
.label {
  margin: 0 0 6px;
}
.chips-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.kw {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 10px;
  border-radius: 999px;
  background: var(--surface-2);
  font-size: 0.8rem;
}
.kw button {
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 1rem;
  cursor: pointer;
  padding: 0 6px;
}
.kw.pick {
  padding-right: 10px;
  cursor: pointer;
}
.kw.pick input {
  width: 16px;
  height: 16px;
}
.add {
  margin-top: 8px;
}
.plain {
  list-style: none;
  padding: 0;
  margin: 0;
}
@media (max-width: 480px) {
  .head {
    flex-wrap: wrap;
  }
  .name {
    flex: 1 1 60%;
  }
}
</style>
