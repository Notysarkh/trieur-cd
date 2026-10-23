import { barcodeVariants } from '../lib/barcode'
import { Throttle, throttledJson } from '../lib/throttle'

// Accès à MusicBrainz (https://musicbrainz.org), la base musicale libre.
//
// Règles d'usage respectées :
// - au maximum 1 requête par seconde (on prend 1,1 s de marge) via une file d'attente unique ;
// - User-Agent : MusicBrainz demande un User-Agent identifiable. Un navigateur web ne permet pas
//   à un site de le modifier ; c'est donc celui du navigateur qui est envoyé. D'après la doc
//   MusicBrainz, seuls les User-Agent vides ou génériques (Java, Python-urllib…) sont bridés :
//   le nôtre passe. Le vrai garde-fou, c'est la limite par adresse IP, que la file respecte.

const API = 'https://musicbrainz.org/ws/2'
const throttle = new Throttle(1100)

/** Identifiant MusicBrainz réservé aux compilations multi-artistes. */
export const VARIOUS_ARTISTS_ID = '89ad4ac3-39f7-470e-963a-56509c546377'

export interface MbArtistCredit {
  name: string
  joinphrase?: string
  artist: { id: string; name: string; 'sort-name': string }
}

export interface MbTag {
  name: string
  count: number
}

export interface MbRelease {
  id: string
  title: string
  score?: number
  status?: string
  date?: string
  country?: string
  barcode?: string | null
  packaging?: string | null
  'text-representation'?: { language?: string | null; script?: string | null }
  'artist-credit'?: MbArtistCredit[]
  'release-group'?: { id: string; title?: string; 'primary-type'?: string; 'secondary-types'?: string[] }
  'label-info'?: { 'catalog-number'?: string | null; label?: { name: string } | null }[]
  media?: { format?: string | null; 'track-count'?: number }[]
  tags?: MbTag[]
}

export interface MbReleaseGroup {
  id: string
  title: string
  score?: number
  'first-release-date'?: string
  'primary-type'?: string
  'secondary-types'?: string[]
  'artist-credit'?: MbArtistCredit[]
  releases?: { id: string; title: string; status?: string }[]
  tags?: MbTag[]
  genres?: MbTag[]
}

function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ ...params, fmt: 'json' })
  return throttledJson<T>(throttle, `${API}/${path}?${query}`, { headers: { Accept: 'application/json' } })
}

/** Échappe un texte pour la recherche MusicBrainz (syntaxe Lucene). */
function quote(text: string): string {
  return `"${text.replace(/[\\"]/g, '\\$&')}"`
}

/** Toutes les éditions connues pour ce code-barres (avec ou sans le 0 initial). */
export async function searchReleasesByBarcode(barcode: string): Promise<MbRelease[]> {
  const query = `barcode:(${barcodeVariants(barcode).join(' OR ')})`
  const data = await get<{ releases?: MbRelease[] }>('release/', { query, limit: '25' })
  return data.releases ?? []
}

/** Recherche d'albums par artiste et/ou titre (un résultat par album, pas par édition). */
export async function searchReleaseGroups(artist: string, title: string): Promise<MbReleaseGroup[]> {
  const parts: string[] = []
  if (title.trim()) parts.push(`releasegroup:${quote(title.trim())}`)
  if (artist.trim()) parts.push(`artist:${quote(artist.trim())}`)
  if (!parts.length) return []
  const data = await get<{ 'release-groups'?: MbReleaseGroup[] }>('release-group/', {
    query: parts.join(' AND '),
    limit: '15',
  })
  return data['release-groups'] ?? []
}

/** Détails d'un album : date de première sortie et genres. */
export function lookupReleaseGroup(id: string): Promise<MbReleaseGroup> {
  return get<MbReleaseGroup>(`release-group/${id}`, { inc: 'genres+tags+artist-credits' })
}

export interface MbArtist {
  id: string
  name: string
  'sort-name': string
  country?: string | null
  area?: { name: string; 'iso-3166-1-codes'?: string[] } | null
  genres?: MbTag[]
  tags?: MbTag[]
}

/** Détails d'une édition : langue des textes et types de l'album (BO, live…). */
export function lookupRelease(id: string): Promise<MbRelease> {
  return get<MbRelease>(`release/${id}`, { inc: 'release-groups' })
}

/** Fiche d'un artiste : pays et genres (utile quand ses albums n'ont pas de genre). */
export function lookupArtist(id: string): Promise<MbArtist> {
  return get<MbArtist>(`artist/${id}`, { inc: 'genres+tags' })
}

/** Artiste affiché, ex. « Simon & Garfunkel » ou « Daft Punk feat. Pharrell Williams ». */
export function creditText(credits: MbArtistCredit[] | undefined): string {
  return (credits ?? []).map((c) => c.name + (c.joinphrase ?? '')).join('').trim()
}

/** Adresses des pochettes sur Cover Art Archive (l'édition exacte d'abord, puis l'album en général). */
export function coverArtUrls(releaseId: string | undefined, releaseGroupId: string | undefined): string[] {
  const urls: string[] = []
  if (releaseId) urls.push(`https://coverartarchive.org/release/${releaseId}/front-250`)
  if (releaseGroupId) urls.push(`https://coverartarchive.org/release-group/${releaseGroupId}/front-250`)
  return urls
}
