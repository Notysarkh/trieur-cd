import type { CdFormat } from '../db/types'

// Formats physiques et épaisseurs par défaut.
//
// HYPOTHÈSES (modifiables dans les Réglages) :
// - boîtier standard 10,4 mm et slim 5,2 mm : dimensions normalisées, fiables ;
// - double épais 22 mm (mesuré sur ta collection) ; beaucoup de doubles CD récents
//   tiennent pourtant dans un boîtier standard de 10,4 mm → à corriger au cas par cas ;
// - digipak 7 mm : varie de 5 à 12 mm selon le nombre de volets → à mesurer ;
// - pochette carton 4 mm ; coffret 30 mm : pure estimation → à mesurer.

export const FORMAT_LABELS: Record<CdFormat, string> = {
  standard: 'Boîtier standard',
  slim: 'Boîtier slim',
  double: 'Boîtier double épais',
  digipak: 'Digipak',
  carton: 'Pochette carton',
  coffret: 'Coffret',
  autre: 'Autre',
}

export type ThicknessTable = Record<CdFormat, number>

export const DEFAULT_THICKNESS: ThicknessTable = {
  standard: 10.4,
  slim: 5.2,
  double: 22,
  digipak: 7,
  carton: 4,
  coffret: 30,
  autre: 10.4,
}

/**
 * Devine le format à partir du « packaging » indiqué par MusicBrainz
 * (ex. « Jewel Case », « Digipak ») et du nombre de disques.
 */
export function formatFromMusicBrainz(packaging: string | null | undefined, discCount: number): CdFormat {
  const p = (packaging ?? '').toLowerCase()
  if (p.includes('slim')) return 'slim'
  if (p.includes('digipak') || p.includes('digibook') || p.includes('gatefold')) return 'digipak'
  if (p.includes('cardboard') || p.includes('paper sleeve')) return 'carton'
  if (discCount >= 3 || p === 'box') return 'coffret'
  // « Jewel Case », « Super Jewel Box » ou packaging inconnu : boîtier cristal.
  if (discCount === 2) return 'double'
  return 'standard'
}

/**
 * Devine le format à partir des descriptions Discogs
 * (ex. ["CD", "Album", "Digipak"]) et du nombre de disques.
 */
export function formatFromDiscogs(descriptions: string[] | undefined, discCount: number): CdFormat {
  const d = (descriptions ?? []).join(' ').toLowerCase()
  if (d.includes('box set')) return 'coffret'
  if (d.includes('digipak') || d.includes('digibook')) return 'digipak'
  if (d.includes('slim')) return 'slim'
  if (d.includes('card') || d.includes('sleeve')) return 'carton'
  if (discCount >= 3) return 'coffret'
  if (discCount === 2) return 'double'
  return 'standard'
}
