import type { VideoFormat } from '../db/types'

// Les supports des films : nom affiché et dimensions par défaut du boîtier.
//
// HYPOTHÈSES à mesurer (sauf DVD, 14 mm × 19 cm × 13,5 cm de large) :
// - Blu-ray et Blu-ray 4K : 11 mm × 17 cm × 12,8 cm ;
// - HD DVD : 14 mm × 19 cm × 13,5 cm (boîtier proche du DVD) ;
// - clé USB vendue en boîtier : 15 mm × 19 cm × 13,5 cm ;
// - LaserDisc : pochette carrée de 31 × 31 cm, 5 mm par disque ;
// - VHS : boîte de 25 mm × 20,5 cm × 11,5 cm par cassette ;
// - Betamax : boîte de 27 mm × 16,5 cm × 10,5 cm par cassette.
// Les boîtiers de plusieurs disques sont plus épais ; pour les cassettes et les LaserDisc, l'épaisseur est
// multipliée par le nombre de cassettes ou de disques.

export interface VideoFormatInfo {
  label: string
  /** Épaisseur (mm) selon le nombre de disques ou de cassettes. */
  thicknessMm: (count: number) => number
  heightCm: number
  widthCm: number
}

const discBox = (one: number, three: number, five: number) => (n: number) => (n >= 5 ? five : n >= 3 ? three : one)
const perItem = (mm: number) => (n: number) => mm * Math.max(1, n)

export const VIDEO_FORMATS: Record<VideoFormat, VideoFormatInfo> = {
  dvd: { label: 'DVD', thicknessMm: discBox(14, 22, 28), heightCm: 19, widthCm: 13.5 },
  bluray: { label: 'Blu-ray', thicknessMm: discBox(11, 15, 22), heightCm: 17, widthCm: 12.8 },
  uhd: { label: 'Blu-ray 4K', thicknessMm: discBox(11, 15, 22), heightCm: 17, widthCm: 12.8 },
  hddvd: { label: 'HD DVD', thicknessMm: discBox(14, 22, 28), heightCm: 19, widthCm: 13.5 },
  usb: { label: 'Clé USB', thicknessMm: () => 15, heightCm: 19, widthCm: 13.5 },
  laserdisc: { label: 'LaserDisc', thicknessMm: perItem(5), heightCm: 31, widthCm: 31 },
  vhs: { label: 'VHS', thicknessMm: perItem(25), heightCm: 20.5, widthCm: 11.5 },
  betamax: { label: 'Betamax', thicknessMm: perItem(27), heightCm: 16.5, widthCm: 10.5 },
}

export const VIDEO_FORMAT_LABELS = Object.fromEntries(
  Object.entries(VIDEO_FORMATS).map(([k, v]) => [k, v.label]),
) as Record<VideoFormat, string>

/** Épaisseur (mm) et hauteur (cm) par défaut d'un film, selon son support et son nombre de disques. */
export function videoSize(format: VideoFormat, discCount: number): { thicknessMm: number; heightCm: number } {
  const f = VIDEO_FORMATS[format] ?? VIDEO_FORMATS.dvd
  return { thicknessMm: f.thicknessMm(discCount), heightCm: f.heightCm }
}
