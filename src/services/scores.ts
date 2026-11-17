import { db, itemsOf } from '../db/database'
import type { Cd } from '../db/types'
import type { MediaKind } from '../lib/media'
import { withOmdbScores } from './films'
import { mbScores } from './identify'
import * as mb from './musicbrainz'
import { hasOmdbKey } from './omdb'
import { bestRawgMatch, getRawgGame, hasRawgKey, searchRawg } from './rawg'

// Récupère les avis extérieurs des objets déjà dans la collection (les nouveaux les reçoivent au scan) :
// - jeux : note Metacritic donnée par RAWG ;
// - films : Metacritic, IMDb et Rotten Tomatoes (OMDb) ;
// - musique : note des utilisateurs de MusicBrainz.
// Une seule demande par objet ; un objet déjà vérifié (scoresAt) est passé, sauf si tu demandes de tout refaire.

/** Ce dont chaque univers a besoin pour chercher des avis. */
export function scoresAvailable(media: MediaKind): boolean {
  if (media === 'jeu') return hasRawgKey()
  if (media === 'video') return hasOmdbKey()
  return media === 'cd'
}

export function needsScores(cd: Cd, all = false): boolean {
  if (cd.boxSet) return false
  if (!all && cd.scoresAt) return false
  if ((cd.media ?? 'cd') === 'cd') return !!cd.mbReleaseGroupId
  return true
}

async function scoresFor(cd: Cd): Promise<Partial<Cd>> {
  const media = cd.media ?? 'cd'
  if (media === 'jeu') {
    const g = cd.rawgId
      ? await getRawgGame(cd.rawgId)
      : bestRawgMatch(await searchRawg(cd.title, cd.platform, 'normal'), cd.title)
    if (!g) return {}
    return { rawgId: g.id, ...(g.metacritic ? { scores: { ...cd.scores, metacritic: g.metacritic } } : {}) }
  }
  if (media === 'video') {
    const d = await withOmdbScores(cd, 'normal', true)
    return { imdbId: d.imdbId, scores: d.scores }
  }
  const rg = await mb.lookupReleaseGroup(cd.mbReleaseGroupId!)
  return { scores: { ...cd.scores, ...mbScores(rg) } }
}

/** Notes d'un seul objet, juste après son ajout à la main (sans attendre ; une erreur est ignorée). */
export async function refreshScoresOf(id: string): Promise<void> {
  const cd = await db.cds.get(id)
  if (!cd || !scoresAvailable(cd.media ?? 'cd') || !needsScores(cd, true)) return
  try {
    const changes = await scoresFor(cd)
    await db.cds.update(id, JSON.parse(JSON.stringify({ ...changes, scoresAt: Date.now(), updatedAt: Date.now() })))
  } catch {
    // Source injoignable : le bouton des Réglages pourra le refaire.
  }
}

export interface ScoresProgress {
  done: number
  total: number
  found: number
}

/** Cherche les avis d'un univers ; `stop()` (renvoyé par `onStart`) arrête proprement. */
export async function refreshScores(
  media: MediaKind,
  onProgress: (p: ScoresProgress) => void,
  options: { all?: boolean; shouldStop?: () => boolean } = {},
): Promise<ScoresProgress> {
  const items = (await itemsOf(media)).filter((c) => needsScores(c, options.all))
  const p: ScoresProgress = { done: 0, total: items.length, found: 0 }
  onProgress({ ...p })
  for (const cd of items) {
    if (options.shouldStop?.()) break
    try {
      const changes = await scoresFor(cd)
      if (changes.scores && Object.values(changes.scores).some((v) => v != null)) p.found++
      await db.cds.update(cd.id, JSON.parse(JSON.stringify({ ...changes, scoresAt: Date.now(), updatedAt: Date.now() })))
    } catch {
      // Source injoignable pour cet objet : on le retentera la prochaine fois.
    }
    p.done++
    onProgress({ ...p })
  }
  return p
}
