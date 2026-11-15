import type { Platform } from '../db/types'

// Les consoles de jeux vidéo (v2, étape D).
//
// - « label » : le nom affiché, et le mot-clé qui relie un jeu au thème de sa console (écran Thèmes).
// - « bnf » : comment la BnF écrit la console dans la description du support (« 1 cartouche Nintendo DS »,
//   « 1 disque optique numérique (PlayStation 2) », « (UMD) » pour la PSP). Vérifié le 15/11/2026 sur
//   150 notices par console : PS1, PS2, PS3, PSP, Nintendo DS, Switch, Super Nintendo.
//   L'ordre compte : les plus précis d'abord (« Super Nintendo » avant « Nintendo », « 3DS » avant « DS »).
// - « rawg » : les noms courts (slugs) des plateformes sur RAWG.
// - épaisseur, hauteur et largeur du boîtier : HYPOTHÈSES à mesurer (sûres seulement pour les boîtiers type DVD,
//   13,5 cm de large, et les boîtiers CD de la PS1, 14,2 cm). La largeur sert aux meubles où les jeux sont
//   couchés, tranche vers le haut (tiroirs, bacs).

export interface PlatformInfo {
  id: Platform
  label: string
  bnf?: RegExp
  /** Mots à chercher à la BnF pour cette console (par défaut son nom). */
  bnfWords?: string
  rawg: string[]
  thicknessMm: number
  heightCm: number
  /** Largeur du boîtier (cm) : c'est elle qui occupe la hauteur quand le jeu est couché, tranche vers le haut. */
  widthCm: number
}

export const PLATFORMS: PlatformInfo[] = [
  { id: 'ps1', label: 'PlayStation 1', bnfWords: 'PlayStation', rawg: ['playstation1'], thicknessMm: 10, heightCm: 13, widthCm: 14.2 },
  { id: 'ps2', label: 'PlayStation 2', bnf: /play\s?station\s?2\b|\bps2\b/i, rawg: ['playstation2'], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
  { id: 'ps3', label: 'PlayStation 3', bnf: /play\s?station\s?3\b|\bps3\b/i, rawg: ['playstation3'], thicknessMm: 14, heightCm: 17, widthCm: 13.5 },
  { id: 'psp', label: 'PSP', bnf: /\bUMD\b|play\s?station portable|\bPSP\b/i, bnfWords: 'UMD', rawg: ['psp'], thicknessMm: 15, heightCm: 18, widthCm: 10.5 },
  { id: 'nds', label: 'Nintendo DS', bnf: /ninten[dt]o\s*DS\b|\bNDS\b/i, rawg: ['nintendo-ds'], thicknessMm: 14, heightCm: 14, widthCm: 12.5 },
  { id: 'switch', label: 'Nintendo Switch', bnf: /switch(?!\s*2)\b/i, rawg: ['nintendo-switch'], thicknessMm: 11, heightCm: 17, widthCm: 10.5 },
  { id: 'snes', label: 'Super Nintendo', bnf: /super\s*(nintendo|famicom|NES)\b/i, rawg: ['snes'], thicknessMm: 35, heightCm: 19, widthCm: 13 },
  // Les autres consoles, rangées ensemble dans « Autres consoles » (tu peux leur créer un thème).
  { id: 'ps4', label: 'PlayStation 4', bnf: /play\s?station\s?4\b|\bps4\b/i, rawg: ['playstation4'], thicknessMm: 14, heightCm: 17, widthCm: 13.5 },
  { id: 'ps5', label: 'PlayStation 5', bnf: /play\s?station\s?5\b|\bps5\b/i, rawg: ['playstation5'], thicknessMm: 14, heightCm: 17, widthCm: 13.5 },
  { id: 'vita', label: 'PS Vita', bnf: /vita\b/i, rawg: ['ps-vita'], thicknessMm: 11, heightCm: 13, widthCm: 10.5 },
  { id: '3ds', label: 'Nintendo 3DS', bnf: /3\s?DS\b/i, rawg: ['nintendo-3ds'], thicknessMm: 14, heightCm: 14, widthCm: 12.5 },
  { id: 'switch2', label: 'Nintendo Switch 2', bnf: /switch\s*2\b/i, rawg: ['nintendo-switch-2'], thicknessMm: 11, heightCm: 17, widthCm: 10.5 },
  { id: 'n64', label: 'Nintendo 64', bnf: /nintendo\s*64\b|\bN64\b/i, rawg: ['nintendo-64'], thicknessMm: 35, heightCm: 19, widthCm: 13 },
  { id: 'gc', label: 'GameCube', bnf: /game\s?cube/i, rawg: ['gamecube'], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
  { id: 'wiiu', label: 'Wii U', bnf: /wii\s?u\b/i, rawg: ['wii-u'], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
  { id: 'wii', label: 'Wii', bnf: /\bwii\b/i, rawg: ['wii'], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
  { id: 'gba', label: 'Game Boy Advance', bnf: /game\s?boy\s?advance|\bGBA\b/i, rawg: ['game-boy-advance'], thicknessMm: 25, heightCm: 13, widthCm: 12.5 },
  { id: 'gb', label: 'Game Boy', bnf: /game\s?boy/i, rawg: ['game-boy', 'game-boy-color'], thicknessMm: 25, heightCm: 13, widthCm: 12.5 },
  { id: 'nes', label: 'NES', bnf: /nintendo entertainment system|\bNES\b/i, rawg: ['nes'], thicknessMm: 35, heightCm: 19, widthCm: 13 },
  { id: 'xsx', label: 'Xbox Series', bnf: /xbox\s*series/i, rawg: ['xbox-series-x'], thicknessMm: 14, heightCm: 17, widthCm: 13.5 },
  { id: 'xone', label: 'Xbox One', bnf: /xbox\s*one/i, rawg: ['xbox-one'], thicknessMm: 14, heightCm: 17, widthCm: 13.5 },
  { id: 'x360', label: 'Xbox 360', bnf: /xbox\s*360/i, rawg: ['xbox360'], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
  { id: 'xbox', label: 'Xbox', bnf: /xbox/i, rawg: ['xbox-old'], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
  { id: 'md', label: 'Mega Drive', bnf: /mega\s?drive|genesis/i, rawg: ['genesis'], thicknessMm: 25, heightCm: 19, widthCm: 13.5 },
  { id: 'pc', label: 'PC', bnf: /\bPC\b|windows|CD-ROM|DVD-ROM/i, rawg: ['pc'], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
  { id: 'autre', label: 'Autre console', rawg: [], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
]

/** Consoles que tu possèdes (thèmes par défaut, dans cet ordre de rangement). */
export const MY_PLATFORMS: Platform[] = ['ps1', 'ps2', 'ps3', 'psp', 'nds', 'switch', 'snes']

export function platformInfo(id: Platform | undefined): PlatformInfo | undefined {
  return id ? PLATFORMS.find((p) => p.id === id) : undefined
}

export function platformLabel(id: Platform | undefined): string {
  return platformInfo(id)?.label ?? 'Console inconnue'
}

/**
 * La console d'après la description du support à la BnF (« 1 cartouche Nintendo DS »…).
 * Plusieurs consoles citées (« Nintendo Switch ou Sony Playstation 4 ») : la première écrite.
 * Une « PlayStation » sans numéro est une PlayStation 1.
 */
export function platformFromText(text: string | undefined): Platform | undefined {
  if (!text) return undefined
  let best: { id: Platform; at: number } | undefined
  for (const p of PLATFORMS) {
    const at = p.bnf ? text.search(p.bnf) : -1
    if (at >= 0 && (!best || at < best.at)) best = { id: p.id, at }
  }
  const ps1 = text.search(/play\s?station(?!\s*(\d|portable|vita))/i)
  if (ps1 >= 0 && (!best || ps1 < best.at)) return 'ps1'
  return best?.id
}

/** Notre console correspondant à une plateforme RAWG (« playstation2 » → PS2). */
export function platformFromRawg(slug: string): Platform | undefined {
  return PLATFORMS.find((p) => p.rawg.includes(slug))?.id
}
