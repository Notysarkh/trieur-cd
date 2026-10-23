import { barcodeVariants } from '../lib/barcode'
import { Throttle, throttledJson } from '../lib/throttle'
import { settings } from './settings'

// Accès à Discogs (https://www.discogs.com), qui a des genres/styles plus fins que MusicBrainz
// et connaît souvent des éditions françaises absentes de MusicBrainz.
//
// - Il faut un « jeton personnel » (gratuit) saisi dans les Réglages. Il reste sur ton appareil.
// - Limite Discogs : 60 requêtes par minute → on espace les appels d'1 seconde.

const API = 'https://api.discogs.com'
const throttle = new Throttle(1000)

export interface DgSearchResult {
  id: number
  type: 'release' | 'master' | string
  /** Format « Artiste - Titre ». */
  title: string
  year?: string
  country?: string
  label?: string[]
  catno?: string
  genre?: string[]
  style?: string[]
  format?: string[]
  format_quantity?: number
  barcode?: string[]
  cover_image?: string
  thumb?: string
  master_id?: number
}

export interface DgMaster {
  id: number
  year?: number
  title: string
}

export function hasDiscogsToken(): boolean {
  return settings.discogsToken.trim().length > 0
}

function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams(params)
  return throttledJson<T>(throttle, `${API}${path}${query.size ? '?' + query : ''}`, {
    headers: { Authorization: `Discogs token=${settings.discogsToken.trim()}` },
  })
}

/** Éditions Discogs pour ce code-barres. On essaie les deux écritures (avec/sans 0 initial). */
export async function searchByBarcode(barcode: string): Promise<DgSearchResult[]> {
  // Discogs indexe les UPC sur 12 chiffres : on commence par la forme la plus courte.
  for (const code of barcodeVariants(barcode).reverse()) {
    const data = await get<{ results?: DgSearchResult[] }>('/database/search', {
      barcode: code,
      type: 'release',
      per_page: '25',
    })
    if (data.results?.length) return data.results
  }
  return []
}

/** Recherche d'albums (« masters ») par artiste et titre ; à défaut, d'éditions. */
export async function searchByText(artist: string, title: string): Promise<DgSearchResult[]> {
  const params: Record<string, string> = { per_page: '15' }
  if (artist.trim()) params.artist = artist.trim()
  if (title.trim()) params.release_title = title.trim()
  const masters = await get<{ results?: DgSearchResult[] }>('/database/search', { ...params, type: 'master' })
  if (masters.results?.length) return masters.results
  const releases = await get<{ results?: DgSearchResult[] }>('/database/search', {
    ...params,
    type: 'release',
    format: 'CD',
  })
  return releases.results ?? []
}

/** Fiche « master » (l'album, toutes éditions confondues) : donne l'année de sortie d'origine. */
export function getMaster(id: number): Promise<DgMaster> {
  return get<DgMaster>(`/masters/${id}`)
}

/** Vérifie que le jeton fonctionne (utilisé dans les Réglages). */
export async function testToken(): Promise<boolean> {
  try {
    await get('/oauth/identity')
    return true
  } catch {
    return false
  }
}

/** Sépare « Artiste - Titre » en deux. */
export function splitDiscogsTitle(full: string): { artist: string; title: string } {
  const i = full.indexOf(' - ')
  if (i < 0) return { artist: '', title: full.trim() }
  return { artist: full.slice(0, i).trim(), title: full.slice(i + 3).trim() }
}

/** Discogs renvoie une image « spacer.gif » quand il n'a pas de pochette. */
export function usableCover(url: string | undefined): string | undefined {
  if (!url || url.includes('spacer.gif')) return undefined
  return url
}
