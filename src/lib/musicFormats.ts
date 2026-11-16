import type { MusicFormat } from '../db/types'

// Les supports de la musique : nom affiché et dimensions par défaut.
//
// - CD et SA-CD : boîtier de CD (12,5 × 14,2 cm) ; l'épaisseur dépend du conditionnement
//   (boîtier standard, digipak…, voir formats.ts et les Réglages).
// HYPOTHÈSES à mesurer pour les autres :
// - vinyle 33 tours : pochette 31,5 × 31,5 cm, 4 mm par disque ; 45 tours : 18 × 18 cm, 3 mm par disque ;
// - cassette : boîtier 17 mm × 11 cm × 7 cm ;
// - MiniDisc : boîtier 10 mm × 7,5 cm × 7 cm ;
// - DVD-Audio : boîtier DVD (14 mm × 19 × 13,5 cm) ; Blu-ray Pure Audio : boîtier Blu-ray (11 mm × 17 × 12,8 cm).

export interface MusicFormatInfo {
  label: string
  /** Boîtier de CD : l'épaisseur vient du conditionnement choisi (standard, digipak…). */
  cdCase: boolean
  /** Épaisseur (mm) selon le nombre de disques ou de cassettes (supports sans boîtier de CD). */
  thicknessMm: (count: number) => number
  heightCm: number
  widthCm: number
}

const perItem = (mm: number) => (n: number) => mm * Math.max(1, n)
const discBox = (one: number, three: number, five: number) => (n: number) => (n >= 5 ? five : n >= 3 ? three : one)

export const MUSIC_FORMATS: Record<MusicFormat, MusicFormatInfo> = {
  cd: { label: 'CD', cdCase: true, thicknessMm: perItem(10.4), heightCm: 12.5, widthCm: 14.2 },
  vinyle: { label: 'Vinyle 33 tours', cdCase: false, thicknessMm: perItem(4), heightCm: 31.5, widthCm: 31.5 },
  vinyle45: { label: 'Vinyle 45 tours', cdCase: false, thicknessMm: perItem(3), heightCm: 18, widthCm: 18 },
  cassette: { label: 'Cassette', cdCase: false, thicknessMm: perItem(17), heightCm: 11, widthCm: 7 },
  minidisc: { label: 'MiniDisc', cdCase: false, thicknessMm: perItem(10), heightCm: 7.5, widthCm: 7 },
  sacd: { label: 'SA-CD', cdCase: true, thicknessMm: perItem(10.4), heightCm: 12.5, widthCm: 14.2 },
  dvda: { label: 'DVD-Audio', cdCase: false, thicknessMm: discBox(14, 22, 28), heightCm: 19, widthCm: 13.5 },
  bdaudio: { label: 'Blu-ray Pure Audio', cdCase: false, thicknessMm: discBox(11, 15, 22), heightCm: 17, widthCm: 12.8 },
}

export const MUSIC_FORMAT_LABELS = Object.fromEntries(
  Object.entries(MUSIC_FORMATS).map(([k, v]) => [k, v.label]),
) as Record<MusicFormat, string>

export function musicFormatInfo(f: MusicFormat | undefined): MusicFormatInfo {
  return MUSIC_FORMATS[f ?? 'cd'] ?? MUSIC_FORMATS.cd
}

/**
 * Dimensions par défaut d'un support sans boîtier de CD (vinyle, cassette…) ;
 * null pour le CD et le SA-CD (épaisseur selon le conditionnement).
 */
export function musicSize(f: MusicFormat | undefined, discCount: number): { thicknessMm: number; heightCm: number } | null {
  const info = musicFormatInfo(f)
  return info.cdCase ? null : { thicknessMm: info.thicknessMm(discCount), heightCm: info.heightCm }
}

/**
 * Le support d'après un texte de format MusicBrainz (« 12" Vinyl », « Cassette », « Hybrid SACD »,
 * « DVD-Audio », « Blu-ray ») ou Discogs (« Vinyl », « LP », « 7" », « Minidisc », « SACD »…).
 * undefined = CD (ou inconnu).
 */
export function musicFormatFromText(text: string): MusicFormat | undefined {
  const t = text.toLowerCase()
  if (/sacd|sa-cd|super audio/.test(t)) return 'sacd'
  if (/dvd-?audio|dvd-a\b/.test(t)) return 'dvda'
  if (/blu-?ray/.test(t)) return 'bdaudio'
  if (/mini\s?disc/.test(t)) return 'minidisc'
  if (/cassette/.test(t)) return 'cassette'
  if (/7"|7 inch|45 rpm|\bsingle\b.*vinyl|vinyl.*\b7"/.test(t)) return 'vinyle45'
  if (/vinyl|\blp\b|12"|10"|33 ?⅓|33 rpm/.test(t)) return 'vinyle'
  return undefined
}

/** Support d'une édition MusicBrainz : celui de ses disques (le premier qui n'est pas un CD). */
export function musicFormatFromMb(media: { format?: string | null }[] | undefined): MusicFormat | undefined {
  for (const m of media ?? []) {
    const f = m.format ? musicFormatFromText(m.format) : undefined
    if (f) return f
  }
  return undefined
}
