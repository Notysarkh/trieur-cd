import { reactive } from 'vue'
import { buildPlan, type Plan } from '../classification/engine'
import { defaultRules, type ClassificationRules } from '../classification/themes'
import { db } from '../db/database'
import type { ArtistInfo, Cd } from '../db/types'
import { hasDiscogsToken } from './discogs'
import { completeWithDiscogs } from './identify'
import { lookupArtist, lookupRelease } from './musicbrainz'
import { saveSetting, settings } from './settings'
import { titleCase } from '../lib/text'

// Lien entre le moteur de classement et le reste de l'appli :
// lecture/écriture des règles, application du plan, recherche des genres d'artistes.

/** Calcule le plan à partir de la collection actuelle. */
export async function computePlan(rules: ClassificationRules = settings.classification): Promise<Plan> {
  const [cds, artists] = await Promise.all([db.cds.toArray(), db.artists.toArray()])
  return buildPlan(cds, rules, new Map(artists.map((a) => [a.mbArtistId, a])))
}

/** Enregistre les règles (après une modification dans l'écran Thèmes ou un artiste forcé). */
export function saveRules(rules: ClassificationRules): Promise<void> {
  return saveSetting('classification', rules)
}

export function resetRules(): Promise<void> {
  return saveRules(defaultRules())
}

/** Force un artiste (ou une compilation) dans un thème ; `null` annule le forçage. */
export async function setOverride(key: string, isCompilation: boolean, themeId: string | null): Promise<void> {
  const rules: ClassificationRules = JSON.parse(JSON.stringify(settings.classification))
  const map = isCompilation ? rules.cdOverrides : rules.artistOverrides
  const id = isCompilation ? key.replace(/^cd:/, '') : key
  if (themeId) map[id] = themeId
  else delete map[id]
  await saveRules(rules)
}

/** Nombre de CD qui changeraient de thème ou de place si on appliquait ce plan. */
export function countChanges(plan: Plan, cds: Cd[]): { theme: number; order: number } {
  let theme = 0
  let order = 0
  for (const cd of cds) {
    const p = plan.placement.get(cd.id)
    if (!p) continue
    if (cd.themeId !== p.themeId) theme++
    else if (cd.shelfOrder !== p.shelfOrder) order++
  }
  return { theme, order }
}

/**
 * Applique le plan : chaque CD reçoit son thème et son rang dans l'ordre de rangement.
 * Seuls les CD qui changent sont modifiés, avec leur date de modification mise à jour :
 * c'est elle qui permet à l'import (téléphone ↔ PC) de garder la version la plus récente.
 */
export async function applyPlan(plan: Plan): Promise<void> {
  const now = Date.now()
  const updates = plan.themes
    .flatMap((t) => t.cds)
    .filter((cd) => {
      const p = plan.placement.get(cd.id)!
      return cd.themeId !== p.themeId || cd.shelfOrder !== p.shelfOrder
    })
    .map((cd) => {
      const p = plan.placement.get(cd.id)!
      return { key: cd.id, changes: { themeId: p.themeId, shelfOrder: p.shelfOrder, updatedAt: now } }
    })
  await db.cds.bulkUpdate(updates)
  await saveSetting('classificationAppliedAt', Date.now())
}

// ---------------------------------------------------------------------------
// Compléter la collection : fiches d'artistes (MusicBrainz) et styles Discogs
// ---------------------------------------------------------------------------

/** Avancement de la tâche de fond « Compléter », affiché dans l'écran Classement. */
export const completion = reactive({
  running: false,
  phase: '' as '' | 'editions' | 'artistes' | 'discogs',
  done: 0,
  total: 0,
  errors: 0,
  cancelled: false,
})

/** Artistes MusicBrainz de la collection dont on n'a pas encore la fiche. */
export async function missingArtistIds(): Promise<string[]> {
  const [cds, known] = await Promise.all([db.cds.toArray(), db.artists.toCollection().primaryKeys()])
  const knownSet = new Set(known)
  const ids = new Set<string>()
  for (const cd of cds) if (cd.mbArtistId && !cd.isCompilation && !knownSet.has(cd.mbArtistId)) ids.add(cd.mbArtistId)
  return [...ids]
}

/** CD MusicBrainz scannés avant l'étape 2 : il leur manque la langue des textes et le type d'album. */
export function cdsWithoutReleaseDetails(): Promise<Cd[]> {
  return db.cds.filter((cd) => !!cd.mbReleaseId && cd.language === undefined && !cd.mbDetailsCheckedAt).toArray()
}

/** CD sans données Discogs, jamais cherchés par artiste + titre (seulement si un jeton Discogs est configuré). */
export async function cdsWithoutDiscogs(): Promise<Cd[]> {
  if (!hasDiscogsToken()) return []
  return db.cds
    .filter(
      (cd) =>
        !cd.discogsReleaseId &&
        !cd.discogsMasterId &&
        !cd.discogsCheckedAt &&
        !cd.isCompilation &&
        cd.artist !== 'Inconnu',
    )
    .toArray()
}

function topNames(tags: { name: string; count: number }[] | undefined, max: number): string[] {
  return [...(tags ?? [])]
    .filter((t) => t.count > 0)
    .sort((x, y) => y.count - x.count)
    .slice(0, max)
    .map((t) => titleCase(t.name))
}

/**
 * Tâche de fond, au rythme imposé par les services (1 requête par seconde) :
 * 1. détails des éditions MusicBrainz scannées avant l'étape 2 (langue des textes, type d'album) ;
 * 2. fiches des artistes sur MusicBrainz (genres de l'artiste, pays) ;
 * 3. styles Discogs des CD qui n'en ont pas (recherche par artiste + titre).
 */
export async function completeCollection(): Promise<void> {
  if (completion.running) return
  Object.assign(completion, { running: true, cancelled: false, errors: 0 })
  try {
    const releases = await cdsWithoutReleaseDetails()
    Object.assign(completion, { phase: 'editions', done: 0, total: releases.length })
    for (const cd of releases) {
      if (completion.cancelled || !navigator.onLine) return
      try {
        const r = await lookupRelease(cd.mbReleaseId!)
        const language = r['text-representation']?.language ?? undefined
        const types = r['release-group']?.['secondary-types'] ?? []
        await db.cds.update(cd.id, {
          mbDetailsCheckedAt: Date.now(),
          ...(language || types.length ? { language, releaseTypes: types, updatedAt: Date.now() } : {}),
        })
      } catch {
        completion.errors++
      }
      completion.done++
    }

    const ids = await missingArtistIds()
    Object.assign(completion, { phase: 'artistes', done: 0, total: ids.length })
    for (const id of ids) {
      if (completion.cancelled || !navigator.onLine) return
      try {
        const a = await lookupArtist(id)
        const info: ArtistInfo = {
          mbArtistId: id,
          name: a.name,
          country: a.country ?? a.area?.['iso-3166-1-codes']?.[0] ?? undefined,
          genres: topNames(a.genres, 5),
          tags: topNames(a.tags, 5),
          fetchedAt: Date.now(),
        }
        await db.artists.put(info)
      } catch {
        completion.errors++
      }
      completion.done++
    }

    const cds = await cdsWithoutDiscogs()
    Object.assign(completion, { phase: 'discogs', done: 0, total: cds.length })
    for (const cd of cds) {
      if (completion.cancelled || !navigator.onLine) return
      const draft = { ...cd }
      const found = await completeWithDiscogs(draft)
      await db.cds.update(cd.id, {
        discogsCheckedAt: Date.now(),
        ...(found
          ? {
              updatedAt: Date.now(),
              genres: draft.genres,
              styles: draft.styles,
              discogsReleaseId: draft.discogsReleaseId,
              discogsMasterId: draft.discogsMasterId,
              coverUrls: draft.coverUrls,
              label: draft.label,
            }
          : {}),
      })
      completion.done++
    }
  } finally {
    Object.assign(completion, { running: false, phase: '' })
  }
}
