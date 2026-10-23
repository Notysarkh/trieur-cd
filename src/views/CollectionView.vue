<script setup lang="ts">
import { computed, ref } from 'vue'
import CoverImage from '../components/CoverImage.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db } from '../db/database'
import type { Cd, CdStatus } from '../db/types'
import { digitsOnly } from '../lib/barcode'
import { normalizeText } from '../lib/text'
import { updateCd } from '../services/collection'
import { shortLocation } from '../services/layout'
import { settings } from '../services/settings'

// Liste de la collection, avec recherche et filtres.
// Le même écran sert pour « À vérifier » (reviewMode).

const props = defineProps<{ reviewMode?: boolean }>()

const cds = useLiveQuery(() => db.cds.toArray(), [] as Cd[])

const search = ref('')
const statusFilter = ref<CdStatus | 'tous'>('tous')
const sort = ref<'artiste' | 'recent' | 'rangement'>('artiste')
const themeFilter = ref<string>('tous')

// Thèmes (nom et couleur) attribués lors du dernier classement appliqué.
const themes = computed(() => new Map(settings.classification.themes.map((t) => [t.id, t])))
const themeLabel = (id: string | undefined) => (id ? (themes.value.get(id)?.name ?? 'À classer') : '')
const themeColor = (id: string | undefined) => (id ? (themes.value.get(id)?.color ?? '#9aa0a6') : 'transparent')

const counts = computed(() => {
  const c = { tous: cds.value.length, identifie: 0, a_verifier: 0, manuel: 0 }
  for (const cd of cds.value) c[cd.status]++
  return c
})

// Texte de recherche de chaque CD, préparé une seule fois (et non à chaque lettre tapée).
const haystacks = computed(
  () =>
    new Map(
      cds.value.map((cd) => [
        cd.id,
        normalizeText([cd.artist, cd.artistSort, cd.title, cd.label, ...cd.genres, ...cd.styles, cd.year].join(' ')),
      ]),
    ),
)

const filtered = computed(() => {
  const status = props.reviewMode ? 'a_verifier' : statusFilter.value
  const q = normalizeText(search.value)
  const qDigits = digitsOnly(search.value)
  let list = cds.value.filter((cd) => status === 'tous' || cd.status === status)
  if (themeFilter.value !== 'tous') list = list.filter((cd) => (cd.themeId ?? 'aucun') === themeFilter.value)
  if (q) {
    // Recherche sur l'artiste, le titre, le label, les genres… et le code-barres.
    list = list.filter((cd) => {
      if (qDigits.length >= 5 && cd.barcode?.includes(qDigits)) return true
      const haystack = haystacks.value.get(cd.id) ?? ''
      return q.split(' ').every((word) => haystack.includes(word))
    })
  }
  return [...list].sort((a, b) =>
    sort.value === 'recent'
      ? b.createdAt - a.createdAt
      : sort.value === 'rangement'
        ? (a.shelfOrder ?? Infinity) - (b.shelfOrder ?? Infinity)
        : a.artistSort.localeCompare(b.artistSort, 'fr', { sensitivity: 'base' }) ||
        (a.year ?? 0) - (b.year ?? 0) ||
        a.title.localeCompare(b.title, 'fr'),
  )
})

// Affichage progressif : 100 CD d'abord, puis « afficher plus » (fluide même avec 750 CD).
const limit = ref(100)
const visible = computed(() => filtered.value.slice(0, limit.value))

async function confirm(cd: Cd) {
  await updateCd(cd.id, { status: 'identifie', confidenceReasons: [...cd.confidenceReasons, 'Vérifié par toi'] })
}
</script>

<template>
  <main class="page stack">
    <div class="row">
      <h1 class="grow">{{ reviewMode ? 'À vérifier' : 'Ma collection' }}</h1>
      <RouterLink v-if="!reviewMode" class="btn btn-small" to="/ajouter">+ Ajouter sans code</RouterLink>
    </div>

    <p v-if="reviewMode" class="muted small">
      Les CD reconnus avec un doute, ou pas reconnus du tout. Ouvre chaque fiche pour corriger, ou confirme d'un clic
      si c'est bon.
    </p>

    <input v-model="search" type="search" placeholder="Rechercher un artiste, un titre, un code-barres…" aria-label="Rechercher" />

    <div v-if="!reviewMode" class="row">
      <div class="chips full" role="group" aria-label="Filtrer par statut">
        <button class="chip" :class="{ active: statusFilter === 'tous' }" @click="statusFilter = 'tous'">
          Tous ({{ counts.tous }})
        </button>
        <button class="chip" :class="{ active: statusFilter === 'identifie' }" @click="statusFilter = 'identifie'">
          Identifiés ({{ counts.identifie }})
        </button>
        <button class="chip" :class="{ active: statusFilter === 'a_verifier' }" @click="statusFilter = 'a_verifier'">
          À vérifier ({{ counts.a_verifier }})
        </button>
        <button class="chip" :class="{ active: statusFilter === 'manuel' }" @click="statusFilter = 'manuel'">
          Manuels ({{ counts.manuel }})
        </button>
      </div>
      <select v-model="sort" class="sort" aria-label="Trier">
        <option value="artiste">Tri : artiste</option>
        <option value="recent">Tri : derniers ajouts</option>
        <option value="rangement">Tri : ordre de rangement</option>
      </select>
      <select v-model="themeFilter" class="sort" aria-label="Filtrer par thème">
        <option value="tous">Tous les thèmes</option>
        <option v-for="t in settings.classification.themes" :key="t.id" :value="t.id">{{ t.name }}</option>
        <option value="a_classer">À classer</option>
        <option value="aucun">Pas encore classés</option>
      </select>
    </div>

    <p class="muted small">{{ filtered.length }} CD</p>

    <ul class="cd-list">
      <li v-for="cd in visible" :key="cd.id">
        <RouterLink :to="{ name: 'cd', params: { id: cd.id } }" class="cd-row">
          <CoverImage :urls="cd.coverUrls" :photo="cd.coverPhoto" :label="cd.title" />
          <div class="grow">
            <div class="title">{{ cd.title }}</div>
            <div class="artist">
              {{ cd.artist }}<template v-if="cd.year"> · {{ cd.year }}</template>
              <template v-if="cd.genres.length"> · {{ cd.genres.join(', ') }}</template>
            </div>
            <div v-if="cd.themeId" class="small theme">
              <span class="dot" :style="{ background: themeColor(cd.themeId) }"></span>{{ themeLabel(cd.themeId) }}
            </div>
            <div v-if="shortLocation(cd)" class="small where">📍 {{ shortLocation(cd) }}</div>
            <div v-else-if="settings.layoutAppliedAt" class="small muted">📍 à ranger (voir la fiche)</div>
            <div v-if="reviewMode" class="muted small reasons">{{ cd.confidenceReasons.join(' · ') }}</div>
          </div>
          <StatusBadge :status="cd.status" :confidence="cd.confidence" />
        </RouterLink>
        <div v-if="reviewMode && cd.artist !== 'Inconnu'" class="row confirm">
          <button class="btn btn-small" @click="confirm(cd)">✓ C'est bon</button>
        </div>
      </li>
    </ul>

    <button v-if="filtered.length > limit" class="btn" @click="limit += 200">
      Afficher plus ({{ filtered.length - limit }} restants)
    </button>

    <div v-if="!cds.length" class="card stack">
      <p>Ta collection est vide pour l'instant.</p>
      <RouterLink to="/scan" class="btn btn-primary btn-big">📷 Scanner mes premiers CD</RouterLink>
    </div>
    <p v-else-if="reviewMode && !filtered.length" class="notice notice-ok">Rien à vérifier, tout est en ordre !</p>
  </main>
</template>

<style scoped>
.chips.full {
  flex: 1 1 100%;
}
.sort {
  width: auto;
  margin-left: auto;
}
.theme {
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex: none;
}
.where {
  font-weight: 600;
}
.reasons {
  white-space: normal;
}
.confirm {
  justify-content: flex-end;
  margin-top: 4px;
}
</style>
