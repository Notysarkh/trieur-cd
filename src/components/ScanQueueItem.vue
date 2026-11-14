<script setup lang="ts">
import { computed } from 'vue'
import type { ScanItem } from '../db/types'
import { BOOK_KIND_LABELS, FORMAT_LABELS } from '../lib/formats'
import { VIDEO_FORMAT_LABELS } from '../services/films'
import { CONFIDENCE_THRESHOLD } from '../services/identify'
import { chooseCandidate, finalDraft, isReady, removeScan, retryErrors, setInclude } from '../services/scanQueue'
import CoverImage from './CoverImage.vue'

// Un code-barres dans la file d'attente, avec son état et les actions possibles.

const props = defineProps<{
  item: ScanItem
  /** Albums (release groups) déjà présents dans la collection, pour signaler une autre édition. */
  ownedAlbums: Set<string>
}>()

// La fiche telle qu'elle sera ajoutée (tient compte de ton choix éventuel).
const draft = computed(() => finalDraft(props.item))

const stateInfo = computed(() => {
  switch (props.item.state) {
    case 'en_attente':
      return { cls: 'badge-info', text: 'En attente' }
    case 'recherche':
      return { cls: 'badge-info', text: 'Recherche…' }
    case 'trouve':
      if (!isReady(props.item)) return { cls: 'badge-info', text: 'Finalisation…' }
      return (draft.value?.confidence ?? 0) >= CONFIDENCE_THRESHOLD
        ? { cls: 'badge-ok', text: `Trouvé · ${draft.value?.confidence}%` }
        : { cls: 'badge-warn', text: `Douteux · ${draft.value?.confidence}%` }
    case 'a_choisir':
      return { cls: 'badge-warn', text: 'À choisir' }
    case 'introuvable':
      return { cls: 'badge-danger', text: 'Introuvable' }
    default:
      return { cls: 'badge-danger', text: 'Erreur' }
  }
})

const otherEdition = computed(
  () =>
    !props.item.duplicateOfIds.length &&
    !!draft.value?.mbReleaseGroupId &&
    props.ownedAlbums.has(draft.value.mbReleaseGroupId),
)
</script>

<template>
  <li class="item card">
    <div class="row top">
      <input
        v-if="item.state === 'trouve'"
        type="checkbox"
        :checked="item.include"
        :aria-label="item.include ? 'Ne pas l’ajouter à la collection' : 'L’ajouter à la collection'"
        @change="setInclude(item.id, ($event.target as HTMLInputElement).checked)"
      />
      <CoverImage :urls="draft?.coverUrls" :label="draft?.title" :size="56" />
      <div class="grow">
        <div class="title">{{ draft?.title ?? `Code ${item.barcode}` }}</div>
        <div class="muted small">
          <template v-if="draft">
            {{ draft.artist }}<template v-if="draft.year"> · {{ draft.year }}</template>
            <template v-if="draft.media === 'video'">· {{ VIDEO_FORMAT_LABELS[draft.videoFormat ?? 'dvd'] }}<template v-if="draft.discCount > 1"> × {{ draft.discCount }}</template></template>
            <template v-else-if="draft.media === 'livre'">· {{ BOOK_KIND_LABELS[draft.bookKind ?? 'livre'] }}<template v-if="draft.label"> · {{ draft.label }}</template></template>
            <template v-else>· {{ FORMAT_LABELS[draft.format] }}</template>
          </template>
          <template v-else>{{ item.barcode }}</template>
        </div>
      </div>
      <span class="badge" :class="stateInfo.cls">{{ stateInfo.text }}</span>
    </div>

    <p v-if="item.duplicateOfIds.length" class="notice notice-warn small">
      Déjà dans ta collection : il ne sera pas ajouté, sauf si tu coches la case (2e exemplaire).
    </p>
    <p v-else-if="otherEdition" class="notice small">Tu as déjà cet album dans une autre édition.</p>
    <p v-if="item.state === 'erreur'" class="notice notice-danger small">{{ item.error }}</p>
    <p v-if="item.state === 'introuvable'" class="muted small">
      Aucune base ne connaît ce code. Envoie-le dans « à vérifier » (tu compléteras la fiche), ou ajoute-le par une recherche texte.
    </p>

    <!-- Plusieurs albums possibles : tu choisis -->
    <fieldset v-if="item.state === 'a_choisir'" class="choices">
      <legend class="small muted">Plusieurs fiches portent ce code. Laquelle as-tu en main ?</legend>
      <button
        v-for="c in item.candidates"
        :key="c.key"
        class="choice"
        @click="chooseCandidate(item.id, c.key)"
      >
        <CoverImage :urls="c.draft.coverUrls" :label="c.draft.title" :size="44" />
        <span class="grow">
          <strong>{{ c.draft.title }}</strong><br />
          <span class="muted small">
            {{ c.draft.artist }}<template v-if="c.draft.year"> · {{ c.draft.year }}</template>
            <template v-if="c.draft.label"> · {{ c.draft.label }}</template>
          </span>
        </span>
      </button>
    </fieldset>

    <details v-if="draft && item.state === 'trouve'" class="small">
      <summary class="muted">Pourquoi {{ draft.confidence }}% ?</summary>
      <ul>
        <li v-for="r in draft.confidenceReasons" :key="r">{{ r }}</li>
      </ul>
      <p v-if="draft.genres.length || draft.styles.length" class="muted">
        Genres : {{ [...draft.genres, ...draft.styles].join(', ') }}
      </p>
    </details>

    <div class="row actions">
      <button v-if="item.state === 'erreur'" class="btn btn-small" @click="retryErrors()">Réessayer</button>
      <RouterLink
        v-if="item.state !== 'en_attente' && item.state !== 'recherche'"
        class="btn btn-small"
        :to="{ name: 'ajouter', query: { code: item.barcode, scan: item.id } }"
      >
        Chercher par texte
      </RouterLink>
      <button class="btn btn-small btn-danger" @click="removeScan(item.id)">Retirer</button>
    </div>
  </li>
</template>

<style scoped>
.item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  list-style: none;
}
.top {
  flex-wrap: nowrap;
}
.title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notice {
  margin: 0;
  padding: 8px 10px;
}
.choices {
  border: 0;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.choice {
  display: flex;
  gap: 10px;
  align-items: center;
  text-align: left;
  font: inherit;
  color: inherit;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px;
  cursor: pointer;
}
.actions {
  justify-content: flex-end;
}
details ul {
  margin: 4px 0;
  padding-left: 20px;
}
</style>
