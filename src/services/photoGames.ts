import type { Candidate, Cd, CdDraft, Platform } from '../db/types'
import { normalizeText, similarity } from '../lib/text'
import { gameSize, searchGames } from './games'
import type { SeenGame } from './vision'

// Jeux lus sur une photo → fiches : chaque titre lu est cherché dans RAWG et la BnF (sur sa console),
// le résultat le plus proche est retenu (tu peux en choisir un autre), puis ajouté à la collection.

/** Titre comparable : sans accents, ponctuation, article initial ni mention d'édition. */
function key(title: string): string {
  return normalizeText(title)
    .replace(/\b(platinum|essentials|player s choice|greatest hits|nintendo selects|classics|best of|edition|collector)\b/g, '')
    .replace(/^(the|le|la|les) /, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Le résultat le plus proche du titre lu (titre identique, sinon le plus ressemblant s'il l'est assez). */
export function bestGameCandidate(cands: Candidate[], title: string): Candidate | undefined {
  const t = key(title)
  const exact = cands.find((c) => key(c.draft.title) === t)
  if (exact) return exact
  const scored = cands
    .map((c) => ({ c, s: Math.max(similarity(key(c.draft.title), t), key(c.draft.title).startsWith(t) ? 0.8 : 0) }))
    .sort((a, b) => b.s - a.s)
  return scored[0] && scored[0].s >= 0.6 ? scored[0].c : undefined
}

/** Deux jeux lus sont-ils le même (même titre, même console ou console inconnue) ? */
export function sameGame(a: { title: string; platform?: Platform }, b: { title: string; platform?: Platform }): boolean {
  return key(a.title) === key(b.title) && (!a.platform || !b.platform || a.platform === b.platform)
}

/** Ce jeu (même titre, même console) est-il déjà dans la collection ? */
export function alreadyOwned(all: Cd[], title: string, platform: Platform | undefined): Cd | undefined {
  const t = key(title)
  return all.find((c) => c.media === 'jeu' && key(c.title) === t && (!platform || !c.platform || c.platform === platform))
}

export interface PhotoGame {
  seen: SeenGame
  candidates: Candidate[]
  chosen?: Candidate
  error?: string
}

/** Cherche un jeu lu sur la photo (RAWG + BnF, sur sa console si elle est connue). */
export async function resolveSeenGame(seen: SeenGame): Promise<PhotoGame> {
  try {
    let candidates = await searchGames(seen.title, seen.platform)
    // Rien sur cette console : on réessaie sans (la console lue a pu être fausse).
    if (!candidates.length && seen.platform) candidates = await searchGames(seen.title)
    return { seen, candidates: candidates.slice(0, 8), chosen: bestGameCandidate(candidates, seen.title) }
  } catch (e) {
    return { seen, candidates: [], error: e instanceof Error ? e.message : 'Recherche impossible.' }
  }
}

/** La fiche à ajouter : le résultat retenu (ou le titre lu seul), sur la console choisie. */
export function draftForPhotoGame(g: PhotoGame, platform: Platform | undefined): CdDraft {
  const base: CdDraft = g.chosen
    ? JSON.parse(JSON.stringify(g.chosen.draft))
    : {
        media: 'jeu',
        artist: 'Éditeur inconnu',
        artistSort: 'Inconnu',
        title: g.seen.title,
        genres: [],
        styles: [],
        format: 'autre',
        discCount: 1,
        coverUrls: [],
        isCompilation: false,
        status: 'a_verifier',
        confidence: 0,
        confidenceReasons: [],
        source: 'manuel',
        thicknessMm: 14,
      }
  const p = platform ?? base.platform
  const sure = !!g.chosen && g.seen.confidence !== 'basse' && !!p
  return {
    ...base,
    platform: p,
    ...gameSize(p, base.discCount),
    noBarcode: true,
    status: sure ? 'identifie' : 'a_verifier',
    confidence: sure ? Math.max(base.confidence, 85) : Math.min(base.confidence, 60),
    confidenceReasons: [
      `Reconnu sur photo (lecture ${g.seen.confidence})${g.chosen ? ' puis trouvé par son titre' : ', aucun résultat trouvé'}`,
      ...(p ? [] : ['Console à choisir']),
    ],
  }
}
