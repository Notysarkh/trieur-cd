import type { Cd } from '../db/types'

// Avis extérieurs : présentation commune (liste de la collection, fiche, export).

export interface ScoreChip {
  key: 'metacritic' | 'imdb' | 'rottenTomatoes' | 'musicbrainz'
  /** Libellé court (« MC », « IMDb »…). */
  short: string
  /** Nom de la source. */
  source: string
  /** Valeur affichée (« 87 », « 7,8 », « 92 % »). */
  text: string
  /** Lien vers la page de la source, si on peut le construire. */
  url?: string
}

const fr = (n: number) => String(n).replace('.', ',')

/** Les avis extérieurs d'un objet, dans un ordre fixe. MusicBrainz : seulement avec au moins 3 votes. */
export function scoreChips(cd: Pick<Cd, 'scores' | 'imdbId' | 'mbReleaseGroupId' | 'title' | 'media'>): ScoreChip[] {
  const s = cd.scores
  if (!s) return []
  const out: ScoreChip[] = []
  const q = encodeURIComponent(cd.title)
  if (s.metacritic != null) {
    out.push({ key: 'metacritic', short: 'MC', source: 'Metacritic', text: String(s.metacritic), url: `https://www.metacritic.com/search/${q}/` })
  }
  if (s.imdb != null) {
    out.push({ key: 'imdb', short: 'IMDb', source: 'IMDb', text: fr(s.imdb), url: cd.imdbId ? `https://www.imdb.com/title/${cd.imdbId}/` : undefined })
  }
  if (s.rottenTomatoes != null) {
    out.push({ key: 'rottenTomatoes', short: 'RT', source: 'Rotten Tomatoes', text: `${s.rottenTomatoes} %`, url: `https://www.rottentomatoes.com/search?search=${q}` })
  }
  if (s.musicbrainz != null && (s.musicbrainzVotes ?? 0) >= 3) {
    out.push({
      key: 'musicbrainz',
      short: 'MB',
      source: `MusicBrainz (${s.musicbrainzVotes} votes)`,
      text: String(s.musicbrainz),
      url: cd.mbReleaseGroupId ? `https://musicbrainz.org/release-group/${cd.mbReleaseGroupId}` : undefined,
    })
  }
  return out
}
