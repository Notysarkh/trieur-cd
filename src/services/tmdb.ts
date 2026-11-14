import { normalizeText } from '../lib/text'
import { Throttle, throttledJson, type Priority } from '../lib/throttle'
import { settings } from './settings'

// TMDB (The Movie Database, https://www.themoviedb.org) : complément pour les films et séries.
// Il ne connaît pas les codes-barres, mais il donne l'affiche, l'année de sortie du film,
// les genres en français et le réalisateur, à partir du titre.
//
// - Il faut une clé personnelle gratuite, saisie dans les Réglages. Elle reste sur ton appareil
//   (jamais dans le code, jamais dans les sauvegardes).
// - HYPOTHÈSE (non testée sans ta clé) : la clé « API (v3) » courte et le « jeton d'accès en lecture »
//   long sont tous deux acceptés.

const API = 'https://api.themoviedb.org/3'
export const tmdbThrottle = new Throttle(250)

export function hasTmdbKey(): boolean {
  return !!settings.tmdbKey.trim()
}

async function get<T>(path: string, params: Record<string, string>, priority: Priority = 'normal'): Promise<T> {
  const key = settings.tmdbKey.trim()
  // Jeton long (« eyJ… ») : en-tête Authorization ; clé courte : paramètre api_key.
  const bearer = key.length > 40
  const query = new URLSearchParams({ language: 'fr-FR', ...params, ...(bearer ? {} : { api_key: key }) })
  return throttledJson<T>(
    tmdbThrottle,
    `${API}/${path}?${query}`,
    { headers: { Accept: 'application/json', ...(bearer ? { Authorization: `Bearer ${key}` } : {}) } },
    priority,
  )
}

export interface TmdbResult {
  id: number
  kind: 'movie' | 'tv'
  title: string
  originalTitle?: string
  year?: number
  genres: string[]
  posterUrl?: string
  overview?: string
}

interface RawResult {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  release_date?: string
  first_air_date?: string
  genre_ids?: number[]
  poster_path?: string | null
  overview?: string
}

let genreNames: Map<number, string> | null = null

/** Noms des genres TMDB en français (« Comédie », « Science-Fiction »…), lus une fois. */
async function genres(priority: Priority): Promise<Map<number, string>> {
  if (genreNames) return genreNames
  const [movie, tv] = await Promise.all([
    get<{ genres: { id: number; name: string }[] }>('genre/movie/list', {}, priority),
    get<{ genres: { id: number; name: string }[] }>('genre/tv/list', {}, priority),
  ])
  genreNames = new Map([...movie.genres, ...tv.genres].map((g) => [g.id, g.name]))
  return genreNames
}

function toResult(r: RawResult, kind: 'movie' | 'tv', names: Map<number, string>): TmdbResult {
  const date = r.release_date || r.first_air_date
  return {
    id: r.id,
    kind,
    title: (r.title ?? r.name ?? '').trim(),
    originalTitle: r.original_title ?? r.original_name,
    year: date ? Number(date.slice(0, 4)) || undefined : undefined,
    genres: [...(kind === 'tv' ? ['Série TV'] : []), ...(r.genre_ids ?? []).map((id) => names.get(id)).filter((n): n is string => !!n)],
    posterUrl: r.poster_path ? `https://image.tmdb.org/t/p/w185${r.poster_path}` : undefined,
    overview: r.overview,
  }
}

/** Films et séries dont le titre correspond (les films d'abord). */
export async function searchTmdb(title: string, priority: Priority = 'high'): Promise<TmdbResult[]> {
  if (!hasTmdbKey() || !title.trim()) return []
  const names = await genres(priority)
  const [movies, tv] = await Promise.all([
    get<{ results: RawResult[] }>('search/movie', { query: title, include_adult: 'false' }, priority),
    get<{ results: RawResult[] }>('search/tv', { query: title, include_adult: 'false' }, priority),
  ])
  return [...movies.results.slice(0, 8).map((r) => toResult(r, 'movie', names)), ...tv.results.slice(0, 4).map((r) => toResult(r, 'tv', names))]
}

/** Le réalisateur d'un film (ou le créateur d'une série). */
export async function tmdbDirector(r: Pick<TmdbResult, 'id' | 'kind'>, priority: Priority = 'normal'): Promise<string | undefined> {
  if (r.kind === 'tv') {
    const tv = await get<{ created_by?: { name: string }[] }>(`tv/${r.id}`, {}, priority)
    return tv.created_by?.[0]?.name
  }
  const credits = await get<{ crew?: { job: string; name: string }[] }>(`movie/${r.id}/credits`, {}, priority)
  return credits.crew?.find((c) => c.job === 'Director')?.name
}

/** Le résultat TMDB qui correspond le mieux à un titre connu (titre identique, à défaut le premier qui le contient). */
export function bestTmdbMatch(results: TmdbResult[], title: string): TmdbResult | undefined {
  const t = normalizeText(title)
  const same = (x?: string) => !!x && normalizeText(x) === t
  return results.find((r) => same(r.title) || same(r.originalTitle)) ?? results.find((r) => normalizeText(r.title).includes(t))
}

/** Vérifie la clé (bouton « Tester » des Réglages). */
export async function testTmdbKey(): Promise<boolean> {
  try {
    genreNames = null
    await genres('high')
    return true
  } catch {
    return false
  }
}
