import { reactive } from 'vue'
import { artistKey, buildPlan, groupKeyOf, type Plan } from '../classification/engine'
import { defaultRules, type ClassificationRules } from '../classification/themes'
import { db } from '../db/database'
import type { ArtistInfo, Cd } from '../db/types'
import { hasDiscogsToken } from './discogs'
import { completeWithDiscogs } from './identify'
import { lookupArtist, lookupRelease, searchArtists } from './musicbrainz'
import { saveSetting, settings } from './settings'
import { isJunkTag, isLatin, latinArtistName } from '../lib/cleanup'
import { guessSortName } from '../lib/sortName'
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
  phase: '' as '' | 'noms' | 'editions' | 'artistes' | 'discogs',
  done: 0,
  total: 0,
  errors: 0,
  cancelled: false,
  /** Noms de tri corrigés lors du dernier passage (pour que tu les voies). */
  sortChanges: [] as string[],
})

interface SortCheck {
  /** Nom tel qu'affiché (ex. « Joan Baez »). */
  name: string
  sort: string
  cds: Cd[]
}

/**
 * Artistes dont le nom de tri est peut-être faux : écrit « Prénom Nom » (« Joan Baez ») au lieu de
 * « Nom, Prénom », ou sans rapport avec le nom affiché (« Three Peters Sisters, The » pour « Peters Sisters »).
 * Cas typique : CD reconnu seulement par Discogs, qui ne donne pas le nom de tri.
 */
export async function artistsToCheckSortName(): Promise<SortCheck[]> {
  const groups = new Map<string, Cd[]>()
  for (const cd of await db.cds.toArray()) {
    if (cd.isCompilation || cd.personalCompilation || cd.sortCheckedAt || cd.artist === 'Inconnu') continue
    const key = groupKeyOf(cd)
    groups.set(key, [...(groups.get(key) ?? []), cd])
  }
  const result: SortCheck[] = []
  for (const cds of groups.values()) {
    const sorts = cds.map((c) => c.artistSort?.trim() || c.artist)
    // Nom de tri de référence : de préférence une forme « Nom, Prénom » déjà présente.
    const sort = sorts.find((x) => x.includes(',')) ?? sorts[0]
    // Nom à chercher : celui d'un CD dont le nom affiché correspond au nom de tri, sinon le premier en lettres latines.
    const name =
      cds.find((c) => artistKey(c.artist) === artistKey(sort))?.artist ??
      cds.find((c) => isLatin(c.artist))?.artist ??
      cds[0].artist
    const notInverted = sorts.some((x) => !x.includes(',') && x.split(/\s+/).length >= 2)
    const unrelated = !cds.some((c) => artistKey(c.artist) === artistKey(sort))
    // Nom de tri dans un autre alphabet (ex. « 倉木麻衣 ») : MusicBrainz connaît souvent sa forme latine.
    if (!isLatin(sort) || notInverted || unrelated) result.push({ name, sort, cds })
  }
  return result
}

/** Nouveau nom de tri d'après la réponse de MusicBrainz (ou null si rien de sûr). */
export function decideSortName(
  check: Pick<SortCheck, 'name' | 'sort'>,
  found: { name?: string; 'sort-name'?: string } | undefined,
): string | null {
  if (found?.['sort-name']) {
    const mb = found['sort-name'].trim()
    if (!isLatin(mb)) return null
    // MusicBrainz trie par le nom complet (nom de scène : « Fatboy Slim », « Cœur de pirate ») :
    // il n'apprend rien, on garde le nom de tri actuel — sauf s'il est dans un autre alphabet.
    const same = artistKey(mb) === artistKey(found.name ?? check.name)
    if (same && !mb.includes(',') && isLatin(check.sort)) return null
    return mb
  }
  // Inconnu de MusicBrainz, mais nom de tri sans rapport avec le nom affiché, qui en est un morceau
  // (« Three Peters Sisters, The » pour « Peters Sisters ») : on trie d'après le nom affiché.
  const nameWords = new Set(artistKey(check.name).split(' '))
  const sortWords = artistKey(check.sort).split(' ')
  const nameInsideSort = [...nameWords].every((w) => sortWords.includes(w))
  if (nameInsideSort && sortWords.length > nameWords.size) return guessSortName(check.name)
  return null
}

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
    .filter((t) => t.count > 0 && !isJunkTag(t.name))
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
  Object.assign(completion, { running: true, cancelled: false, errors: 0, sortChanges: [] })
  try {
    // 0. Noms de tri (« Baez, Joan ») d'après MusicBrainz, pour les artistes mal triés.
    const checks = await artistsToCheckSortName()
    Object.assign(completion, { phase: 'noms', done: 0, total: checks.length })
    for (const check of checks) {
      if (completion.cancelled || !navigator.onLine) return
      try {
        const found = (await searchArtists(check.name)).find(
          (a) => (a.score ?? 0) >= 90 && artistKey(a.name) === artistKey(check.name),
        )
        const newSort = decideSortName(check, found)
        const now = Date.now()
        const toFix = newSort ? check.cds.filter((c) => c.artistSort !== newSort) : []
        await db.cds.bulkUpdate(
          check.cds.map((c) => {
            if (!toFix.includes(c)) return { key: c.id, changes: { sortCheckedAt: now } }
            // Artiste écrit dans un autre alphabet : affiché désormais en lettres latines.
            const latin = latinArtistName(c.artist, newSort!)
            return {
              key: c.id,
              changes: {
                artistSort: newSort!,
                sortCheckedAt: now,
                updatedAt: now,
                ...(latin ? { artist: latin, artistOriginal: c.artistOriginal ?? c.artist } : {}),
              },
            }
          }),
        )
        if (toFix.length) {
          const before = toFix[0].artistSort?.trim() || toFix[0].artist
          completion.sortChanges.push(`${check.name} : « ${before} » → « ${newSort} »`)
        }
      } catch {
        completion.errors++
      }
      completion.done++
    }

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
