<script setup lang="ts">
import { computed, ref } from 'vue'
import CoverImage from '../components/CoverImage.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { useLiveQuery } from '../composables/useLiveQuery'
import { db } from '../db/database'
import type { Cd, CdStatus } from '../db/types'
import { digitsOnly } from '../lib/barcode'
import { fuzzyFilter } from '../lib/fuzzy'
import { normalizeText } from '../lib/text'
import { shelvedDate, updateCd, withoutBarcode } from '../services/collection'
import { shortLocation } from '../services/layout'
import { currentMedia, rulesFor, settings } from '../services/settings'
import { seriesLabel } from '../classification/engine'
import { mediaInfo, mediaOf } from '../lib/media'

// Liste de la collection, avec recherche et filtres.
// Le même écran sert pour « À vérifier » (reviewMode).

const props = defineProps<{ reviewMode?: boolean }>()

const all = useLiveQuery(() => db.cds.toArray(), [] as Cd[])
/** Seulement les fiches de l'univers en cours (CD, livres…). */
const cds = computed(() => all.value.filter((c) => mediaOf(c) === currentMedia()))
const media = computed(() => mediaInfo(currentMedia()))

const search = ref('')
const statusFilter = ref<CdStatus | 'tous'>('tous')
const sort = ref<'artiste' | 'recent' | 'rangement'>('artiste')
const themeFilter = ref<string>('tous')
/** Filtres v1.1 : CD sans code-barres, CD pas encore posés dans les meubles, CD rangés. */
const extraFilter = ref<'aucun' | 'sansCode' | 'aRanger' | 'ranges'>('aucun')
const toggleExtra = (f: typeof extraFilter.value) => (extraFilter.value = extraFilter.value === f ? 'aucun' : f)

// Thèmes (nom et couleur) attribués lors du dernier classement appliqué.
const themeList = computed(() => rulesFor(currentMedia()).themes)
const themes = computed(() => new Map(themeList.value.map((t) => [t.id, t])))
const isBook = computed(() => currentMedia() === 'livre')
const themeLabel = (id: string | undefined) => (id ? (themes.value.get(id)?.name ?? 'À classer') : '')
const themeColor = (id: string | undefined) => (id ? (themes.value.get(id)?.color ?? '#9aa0a6') : 'transparent')

const counts = computed(() => {
  const c = { tous: cds.value.length, identifie: 0, a_verifier: 0, manuel: 0, sansCode: 0, aRanger: 0, ranges: 0 }
  for (const cd of cds.value) {
    c[cd.status]++
    if (withoutBarcode(cd)) c.sansCode++
    if (cd.shelvedAt) c.ranges++
    else c.aRanger++
  }
  return c
})

// Texte de recherche de chaque CD, préparé une seule fois (et non à chaque lettre tapée).
const haystacks = computed(
  () =>
    new Map(
      cds.value.map((cd) => [
        cd.id,
        normalizeText([cd.artist, cd.artistSort, cd.title, cd.series, cd.label, ...cd.genres, ...cd.styles, cd.year].join(' ')),
      ]),
    ),
)

const filtered = computed(() => {
  const status = props.reviewMode ? 'a_verifier' : statusFilter.value
  const q = normalizeText(search.value)
  const qDigits = digitsOnly(search.value)
  let list = cds.value.filter((cd) => status === 'tous' || cd.status === status)
  if (themeFilter.value !== 'tous') list = list.filter((cd) => (cd.themeId ?? 'aucun') === themeFilter.value)
  if (extraFilter.value === 'sansCode') list = list.filter(withoutBarcode)
  else if (extraFilter.value === 'aRanger') list = list.filter((cd) => !cd.shelvedAt)
  else if (extraFilter.value === 'ranges') list = list.filter((cd) => !!cd.shelvedAt)
  if (q) {
    // Un code-barres tapé (au moins 5 chiffres) : recherche directe sur le code.
    const byCode = qDigits.length >= 5 ? list.filter((cd) => cd.barcode?.includes(qDigits)) : []
    if (byCode.length) return byCode
    // Sinon recherche tolérante (fautes de frappe, accents) sur l'artiste, le titre, le label, les genres…
    // Les meilleures correspondances d'abord.
    return fuzzyFilter(list, search.value, (cd) => haystacks.value.get(cd.id) ?? '')
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
      <h1 class="grow">{{ reviewMode ? 'À vérifier' : `Mes ${media.many}` }}</h1>
    </div>
    <div v-if="!reviewMode" class="row actions-row">
      <RouterLink v-if="media.id === 'cd'" class="btn btn-primary grow" to="/ou-est">🔍 Où est ce {{ media.one }} ?</RouterLink>
      <RouterLink v-if="!media.comingInStep" class="btn btn-small" to="/ajouter">{{ isBook ? '+ Livre sans ISBN' : '+ Ajouter sans code' }}</RouterLink>
    </div>

    <p v-if="reviewMode" class="muted small">
      Les CD reconnus avec un doute, ou pas reconnus du tout. Ouvre chaque fiche pour corriger, ou confirme d'un clic
      si c'est bon.
    </p>

    <input v-if="!media.comingInStep" v-model="search" type="search" :placeholder="isBook ? 'Rechercher un auteur, un titre, une série, un ISBN…' : 'Rechercher un artiste, un titre, un code-barres…'" aria-label="Rechercher" />

    <div v-if="!reviewMode && !media.comingInStep" class="row">
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
      <div class="chips full" role="group" aria-label="Autres filtres">
        <button class="chip" :class="{ active: extraFilter === 'sansCode' }" @click="toggleExtra('sansCode')">
          Sans code-barres ({{ counts.sansCode }})
        </button>
        <button class="chip" :class="{ active: extraFilter === 'aRanger' }" @click="toggleExtra('aRanger')">
          À ranger ({{ counts.aRanger }})
        </button>
        <button class="chip" :class="{ active: extraFilter === 'ranges' }" @click="toggleExtra('ranges')">
          Rangés ({{ counts.ranges }})
        </button>
      </div>
      <select v-model="sort" class="sort" aria-label="Trier">
        <option value="artiste">Tri : {{ isBook ? 'auteur' : 'artiste' }}</option>
        <option value="recent">Tri : derniers ajouts</option>
        <option value="rangement">Tri : ordre de rangement</option>
      </select>
      <select v-model="themeFilter" class="sort" aria-label="Filtrer par thème">
        <option value="tous">Tous les thèmes</option>
        <option v-for="t in themeList" :key="t.id" :value="t.id">{{ t.name }}</option>
        <option value="a_classer">À classer</option>
        <option value="aucun">Pas encore classés</option>
      </select>
    </div>

    <p v-if="!media.comingInStep" class="muted small">{{ filtered.length }} {{ filtered.length > 1 ? media.many : media.one }}</p>

    <ul class="cd-list">
      <li v-for="cd in visible" :key="cd.id">
        <RouterLink :to="{ name: 'cd', params: { id: cd.id } }" class="cd-row">
          <CoverImage :urls="cd.coverUrls" :photo="cd.coverPhoto" :label="cd.title" />
          <div class="grow">
            <div class="title">{{ cd.title }}</div>
            <div class="artist">
              <template v-if="cd.series">{{ seriesLabel(cd.series) }}<template v-if="cd.volume"> {{ cd.volume }}</template> · </template>
              {{ cd.artist }}<template v-if="cd.year"> · {{ cd.year }}</template>
              <template v-if="cd.genres.length"> · {{ cd.genres.join(', ') }}</template>
            </div>
            <div v-if="cd.themeId" class="small theme">
              <span class="dot" :style="{ background: themeColor(cd.themeId) }"></span>{{ themeLabel(cd.themeId) }}
            </div>
            <div v-if="shortLocation(cd)" class="small where">
              📍 {{ shortLocation(cd) }}
              <span v-if="cd.shelvedAt" class="badge badge-ok">✓ rangé le {{ shelvedDate(cd) }}</span>
              <span v-else class="badge badge-warn">à ranger</span>
            </div>
            <div v-else-if="settings.layoutAppliedAt && !isBook" class="small muted">📍 à ranger (voir la fiche)</div>
            <span v-if="withoutBarcode(cd)" class="badge badge-info nocode">sans code-barres</span>
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

    <div v-if="!cds.length && media.comingInStep" class="card stack">
      <p>
        {{ media.icon }} L'univers <strong>{{ media.label }}</strong> arrive à l'étape {{ media.comingInStep }} de la version 2 :
        scan, identification, classement et rangement.
      </p>
      <RouterLink to="/" class="btn">← Choisir un autre univers</RouterLink>
    </div>
    <div v-else-if="!cds.length" class="card stack">
      <p>Ta collection est vide pour l'instant.</p>
      <RouterLink to="/scan" class="btn btn-primary btn-big">📷 Scanner mes premiers {{ media.many }}</RouterLink>
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
.nocode {
  margin-top: 2px;
}
.where .badge {
  margin-left: 4px;
}
.reasons {
  white-space: normal;
}
.confirm {
  justify-content: flex-end;
  margin-top: 4px;
}
</style>
