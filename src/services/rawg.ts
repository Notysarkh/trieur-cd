import type { Platform } from '../db/types'
import { platformFromRawg, platformInfo } from '../lib/platforms'
import { normalizeText } from '../lib/text'
import { Throttle, throttledJson, type Priority } from '../lib/throttle'
import { settings } from './settings'

// RAWG (https://rawg.io) : grande base de jeux vidéo, en complément de la BnF.
// Il ne connaît pas les codes-barres, mais il donne une image du jeu, l'année de sortie d'origine,
// les genres et les consoles, à partir du titre.
//
// - Il faut une clé personnelle gratuite, saisie dans les Réglages. Elle reste sur ton appareil
//   (jamais dans le code, jamais dans les sauvegardes).
// - HYPOTHÈSE (non testée sans ta clé) : RAWG accepte les appels depuis une page web (CORS).

const API = 'https://api.rawg.io/api'
export const rawgThrottle = new Throttle(300)

export function hasRawgKey(): boolean {
  return !!settings.rawgKey.trim()
}

async function get<T>(path: string, params: Record<string, string>, priority: Priority = 'normal'): Promise<T> {
  const query = new URLSearchParams({ ...params, key: settings.rawgKey.trim() })
  return throttledJson<T>(rawgThrottle, `${API}/${path}?${query}`, { headers: { Accept: 'application/json' } }, priority)
}

export interface RawgResult {
  id: number
  title: string
  year?: number
  genres: string[]
  /** Nos consoles parmi celles du jeu. */
  platforms: Platform[]
  imageUrl?: string
}

interface RawGame {
  id: number
  name: string
  released?: string | null
  background_image?: string | null
  genres?: { name: string }[]
  platforms?: { platform: { slug: string } }[] | null
}

/** Image plus légère : RAWG propose des miniatures (« /media/crop/600/400/… »). */
function smallImage(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return url.replace('/media/games/', '/media/crop/600/400/games/')
}

export function toRawgResult(g: RawGame): RawgResult {
  return {
    id: g.id,
    title: g.name.trim(),
    year: g.released ? Number(g.released.slice(0, 4)) || undefined : undefined,
    genres: (g.genres ?? []).map((x) => x.name),
    platforms: [...new Set((g.platforms ?? []).map((p) => platformFromRawg(p.platform.slug)).filter((p): p is Platform => !!p))],
    imageUrl: smallImage(g.background_image),
  }
}

// Identifiants RAWG des plateformes (pour filtrer une recherche sur une console), lus une fois.
let platformIds: Map<string, number> | null = null

async function rawgPlatformId(platform: Platform, priority: Priority): Promise<number | undefined> {
  if (!platformIds) {
    const res = await get<{ results: { id: number; slug: string }[] }>('platforms', { page_size: '60' }, priority)
    platformIds = new Map(res.results.map((p) => [p.slug, p.id]))
  }
  const slug = platformInfo(platform)?.rawg.find((s) => platformIds!.has(s))
  return slug ? platformIds.get(slug) : undefined
}

/** Jeux dont le titre correspond (sur une console, si elle est donnée). */
export async function searchRawg(title: string, platform?: Platform, priority: Priority = 'high'): Promise<RawgResult[]> {
  if (!hasRawgKey() || !title.trim()) return []
  const params: Record<string, string> = { search: title, page_size: '10' }
  const id = platform && platform !== 'autre' ? await rawgPlatformId(platform, priority).catch(() => undefined) : undefined
  if (id) params.platforms = String(id)
  const res = await get<{ results: RawGame[] }>('games', params, priority)
  return res.results.map(toRawgResult)
}

/** Le résultat RAWG qui correspond le mieux à un titre connu (titre identique, à défaut le premier qui le contient). */
export function bestRawgMatch(results: RawgResult[], title: string): RawgResult | undefined {
  const t = normalizeText(title)
  return results.find((r) => normalizeText(r.title) === t) ?? results.find((r) => normalizeText(r.title).includes(t) || t.includes(normalizeText(r.title)))
}

/** Vérifie la clé (bouton « Tester » des Réglages). */
export async function testRawgKey(): Promise<boolean> {
  try {
    platformIds = null
    await get('platforms', { page_size: '1' }, 'high')
    return true
  } catch {
    return false
  }
}
