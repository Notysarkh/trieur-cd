import { Throttle, throttledJson, type Priority } from '../lib/throttle'
import { settings } from './settings'

// OMDb (https://www.omdbapi.com) : notes Metacritic, IMDb et Rotten Tomatoes des films.
// Clé personnelle gratuite (1000 demandes par jour), saisie dans les Réglages ; elle reste sur ton appareil
// (jamais dans le code, jamais dans les sauvegardes). OMDb accepte les appels depuis une page web (vérifié le 17/11/2026).

const API = 'https://www.omdbapi.com/'
const omdbThrottle = new Throttle(200)

export function hasOmdbKey(): boolean {
  return !!settings.omdbKey.trim()
}

interface RawOmdb {
  Response: 'True' | 'False'
  Error?: string
  imdbID?: string
  Metascore?: string
  imdbRating?: string
  Ratings?: { Source: string; Value: string }[]
}

export interface OmdbScores {
  imdbId?: string
  /** Metacritic, sur 100. */
  metacritic?: number
  /** IMDb, sur 10. */
  imdb?: number
  /** Rotten Tomatoes, en %. */
  rottenTomatoes?: number
}

/** Les notes d'une réponse OMDb (« N/A » = pas de note). */
export function toOmdbScores(r: RawOmdb): OmdbScores | undefined {
  if (r.Response !== 'True') return undefined
  const n = (v: string | undefined) => {
    const x = Number.parseFloat((v ?? '').replace(',', '.'))
    return Number.isFinite(x) ? x : undefined
  }
  const rt = r.Ratings?.find((x) => /rotten/i.test(x.Source))?.Value
  return { imdbId: r.imdbID, metacritic: n(r.Metascore), imdb: n(r.imdbRating), rottenTomatoes: n(rt) }
}

/** Notes d'un film, par son identifiant IMDb (fiable) ou, à défaut, par son titre et son année. */
export async function omdbScores(
  q: { imdbId?: string; title?: string; year?: number },
  priority: Priority = 'normal',
): Promise<OmdbScores | undefined> {
  if (!hasOmdbKey()) return undefined
  const params = new URLSearchParams({ apikey: settings.omdbKey.trim() })
  if (q.imdbId) params.set('i', q.imdbId)
  else if (q.title) {
    params.set('t', q.title)
    if (q.year) params.set('y', String(q.year))
  } else return undefined
  return toOmdbScores(await throttledJson<RawOmdb>(omdbThrottle, `${API}?${params}`, {}, priority))
}

/** Vérifie la clé (bouton « Tester » des Réglages). */
export async function testOmdbKey(): Promise<boolean> {
  try {
    const params = new URLSearchParams({ apikey: settings.omdbKey.trim(), i: 'tt0078748' })
    const r = await throttledJson<RawOmdb>(omdbThrottle, `${API}?${params}`, {}, 'high')
    return r.Response === 'True'
  } catch {
    return false
  }
}
