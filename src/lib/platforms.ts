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
  /** Fabricant : sert à regrouper les consoles dans les listes. */
  maker: Maker
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
  // Sony
  { id: 'ps1', maker: 'Sony', label: 'PlayStation 1', bnfWords: 'PlayStation', rawg: ['playstation1'], thicknessMm: 10, heightCm: 13, widthCm: 14.2 },
  { id: 'ps2', maker: 'Sony', label: 'PlayStation 2', bnf: /play\s?station\s?2\b|\bps2\b/i, rawg: ['playstation2'], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
  { id: 'ps3', maker: 'Sony', label: 'PlayStation 3', bnf: /play\s?station\s?3\b|\bps3\b/i, rawg: ['playstation3'], thicknessMm: 14, heightCm: 17, widthCm: 13.5 },
  { id: 'psp', maker: 'Sony', label: 'PSP', bnf: /\bUMD\b|play\s?station portable|\bPSP\b/i, bnfWords: 'UMD', rawg: ['psp'], thicknessMm: 15, heightCm: 18, widthCm: 10.5 },
  // Nintendo (les plus précis d'abord : « Super Nintendo » avant « Nintendo », « 3DS » avant « DS »,
  // « Game Boy Color » et « Advance » avant « Game Boy »)
  { id: 'nds', maker: 'Nintendo', label: 'Nintendo DS', bnf: /ninten[dt]o\s*DS\b|\bNDS\b/i, rawg: ['nintendo-ds'], thicknessMm: 14, heightCm: 14, widthCm: 12.5 },
  { id: 'switch', maker: 'Nintendo', label: 'Nintendo Switch', bnf: /switch(?!\s*2)\b/i, rawg: ['nintendo-switch'], thicknessMm: 11, heightCm: 17, widthCm: 10.5 },
  { id: 'snes', maker: 'Nintendo', label: 'Super Nintendo', bnf: /super\s*(nintendo|famicom|NES)\b/i, rawg: ['snes'], thicknessMm: 35, heightCm: 19, widthCm: 13 },
  // Les autres consoles, rangées ensemble dans « Autres consoles » (tu peux leur créer un thème).
  { id: 'ps4', maker: 'Sony', label: 'PlayStation 4', bnf: /play\s?station\s?4\b|\bps4\b/i, rawg: ['playstation4'], thicknessMm: 14, heightCm: 17, widthCm: 13.5 },
  { id: 'ps5', maker: 'Sony', label: 'PlayStation 5', bnf: /play\s?station\s?5\b|\bps5\b/i, rawg: ['playstation5'], thicknessMm: 14, heightCm: 17, widthCm: 13.5 },
  { id: 'vita', maker: 'Sony', label: 'PS Vita', bnf: /vita\b/i, rawg: ['ps-vita'], thicknessMm: 11, heightCm: 13, widthCm: 10.5 },
  { id: '3ds', maker: 'Nintendo', label: 'Nintendo 3DS', bnf: /3\s?DS\b/i, rawg: ['nintendo-3ds'], thicknessMm: 14, heightCm: 14, widthCm: 12.5 },
  { id: 'switch2', maker: 'Nintendo', label: 'Nintendo Switch 2', bnf: /switch\s*2\b/i, rawg: ['nintendo-switch-2'], thicknessMm: 11, heightCm: 17, widthCm: 10.5 },
  { id: 'n64', maker: 'Nintendo', label: 'Nintendo 64', bnf: /nintendo\s*64\b|\bN64\b/i, rawg: ['nintendo-64'], thicknessMm: 35, heightCm: 19, widthCm: 13 },
  { id: 'gc', maker: 'Nintendo', label: 'GameCube', bnf: /game\s?cube/i, rawg: ['gamecube'], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
  { id: 'wiiu', maker: 'Nintendo', label: 'Wii U', bnf: /wii\s?u\b/i, rawg: ['wii-u'], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
  { id: 'wii', maker: 'Nintendo', label: 'Wii', bnf: /\bwii\b/i, rawg: ['wii'], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
  { id: 'gba', maker: 'Nintendo', label: 'Game Boy Advance', bnf: /game\s?boy\s?advance|\bGBA\b/i, rawg: ['game-boy-advance'], thicknessMm: 25, heightCm: 13, widthCm: 12.5 },
  { id: 'gbc', maker: 'Nintendo', label: 'Game Boy Color', bnf: /game\s?boy\s?colou?r|\bGBC\b/i, rawg: ['game-boy-color'], thicknessMm: 25, heightCm: 13, widthCm: 12.5 },
  { id: 'gb', maker: 'Nintendo', label: 'Game Boy', bnf: /game\s?boy/i, rawg: ['game-boy'], thicknessMm: 25, heightCm: 13, widthCm: 12.5 },
  { id: 'vb', maker: 'Nintendo', label: 'Virtual Boy', bnf: /virtual\s?boy/i, rawg: [], thicknessMm: 40, heightCm: 18, widthCm: 13 },
  { id: 'nes', maker: 'Nintendo', label: 'NES', bnf: /nintendo entertainment system|\bNES\b|famicom/i, rawg: ['nes'], thicknessMm: 35, heightCm: 19, widthCm: 13 },
  // Microsoft
  { id: 'xsx', maker: 'Microsoft', label: 'Xbox Series', bnf: /xbox\s*series/i, rawg: ['xbox-series-x'], thicknessMm: 14, heightCm: 17, widthCm: 13.5 },
  { id: 'xone', maker: 'Microsoft', label: 'Xbox One', bnf: /xbox\s*one/i, rawg: ['xbox-one'], thicknessMm: 14, heightCm: 17, widthCm: 13.5 },
  { id: 'x360', maker: 'Microsoft', label: 'Xbox 360', bnf: /xbox\s*360/i, rawg: ['xbox360'], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
  { id: 'xbox', maker: 'Microsoft', label: 'Xbox', bnf: /xbox/i, rawg: ['xbox-old'], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
  // Sega (« Mega-CD » et « 32X » avant « Mega Drive »)
  { id: 'megacd', maker: 'Sega', label: 'Mega-CD', bnf: /mega[\s-]?cd|sega[\s-]?cd/i, rawg: ['sega-cd'], thicknessMm: 20, heightCm: 19, widthCm: 14 },
  { id: 's32x', maker: 'Sega', label: '32X', bnf: /mega\s?drive\s*32\s?x|\b32\s?x\b/i, rawg: ['sega-32x'], thicknessMm: 25, heightCm: 19, widthCm: 13.5 },
  { id: 'md', maker: 'Sega', label: 'Mega Drive', bnf: /mega\s?drive|genesis/i, rawg: ['genesis'], thicknessMm: 25, heightCm: 19, widthCm: 13.5 },
  { id: 'sms', maker: 'Sega', label: 'Master System', bnf: /master\s?system/i, rawg: ['sega-master-system'], thicknessMm: 25, heightCm: 19, widthCm: 13.5 },
  { id: 'saturn', maker: 'Sega', label: 'Saturn', bnf: /saturn/i, rawg: ['sega-saturn'], thicknessMm: 15, heightCm: 19, widthCm: 14 },
  { id: 'dc', maker: 'Sega', label: 'Dreamcast', bnf: /dreamcast/i, rawg: ['dreamcast'], thicknessMm: 15, heightCm: 19, widthCm: 14 },
  { id: 'gg', maker: 'Sega', label: 'Game Gear', bnf: /game\s?gear/i, rawg: ['game-gear'], thicknessMm: 25, heightCm: 13, widthCm: 12.5 },
  { id: 'sg1000', maker: 'Sega', label: 'SG-1000', bnf: /\bSG[\s-]?1000/i, rawg: [], thicknessMm: 25, heightCm: 16, widthCm: 11 },
  // NEC (« PC Engine CD » avant « PC Engine », et les deux avant « PC »)
  { id: 'pcecd', maker: 'NEC', label: 'PC Engine CD', bnf: /pc[\s-]?engine\s*(cd|duo)|CD[\s-]?ROM(²|2\b)|super\s?CD[\s-]?ROM|turbo\s?grafx[\s-]?CD/i, rawg: [], thicknessMm: 10, heightCm: 12.5, widthCm: 14.2 },
  { id: 'pce', maker: 'NEC', label: 'PC Engine', bnf: /pc[\s-]?engine|turbo\s?grafx|hu[\s-]?card/i, rawg: [], thicknessMm: 15, heightCm: 12.5, widthCm: 14 },
  { id: 'sgx', maker: 'NEC', label: 'SuperGrafx', bnf: /super\s?grafx/i, rawg: [], thicknessMm: 15, heightCm: 12.5, widthCm: 14 },
  { id: 'pcfx', maker: 'NEC', label: 'PC-FX', bnf: /pc[\s-]?fx\b/i, rawg: [], thicknessMm: 10, heightCm: 12.5, widthCm: 14.2 },
  // SNK (les plus précis d'abord)
  { id: 'ngpc', maker: 'SNK', label: 'Neo Geo Pocket Color', bnf: /neo[\s-]?geo\s*pocket\s*colou?r/i, rawg: [], thicknessMm: 25, heightCm: 12, widthCm: 10 },
  { id: 'ngp', maker: 'SNK', label: 'Neo Geo Pocket', bnf: /neo[\s-]?geo\s*pocket/i, rawg: [], thicknessMm: 25, heightCm: 12, widthCm: 10 },
  { id: 'neogeocd', maker: 'SNK', label: 'Neo Geo CD', bnf: /neo[\s-]?geo\s*CD/i, rawg: [], thicknessMm: 24, heightCm: 12.5, widthCm: 14.2 },
  { id: 'neogeo', maker: 'SNK', label: 'Neo Geo AES', bnf: /neo[\s-]?geo/i, rawg: ['neogeo'], thicknessMm: 55, heightCm: 23, widthCm: 16 },
  // Bandai
  { id: 'wsc', maker: 'Bandai', label: 'WonderSwan Color', bnf: /wonder\s?swan\s*colou?r|swan\s?crystal/i, rawg: [], thicknessMm: 25, heightCm: 12.5, widthCm: 10 },
  { id: 'ws', maker: 'Bandai', label: 'WonderSwan', bnf: /wonder\s?swan/i, rawg: [], thicknessMm: 25, heightCm: 12.5, widthCm: 10 },
  { id: 'playdia', maker: 'Bandai', label: 'Playdia', bnf: /playdia/i, rawg: [], thicknessMm: 10, heightCm: 12.5, widthCm: 14.2 },
  // Atari
  { id: 'jaguar', maker: 'Atari', label: 'Jaguar', bnf: /jaguar/i, rawg: ['jaguar'], thicknessMm: 45, heightCm: 22, widthCm: 16 },
  { id: 'lynx', maker: 'Atari', label: 'Lynx', bnf: /\blynx\b/i, rawg: ['atari-lynx'], thicknessMm: 30, heightCm: 16, widthCm: 12 },
  { id: 'a2600', maker: 'Atari', label: 'Atari 2600', bnf: /atari\s?2600|\bVCS\b/i, rawg: ['atari-2600'], thicknessMm: 30, heightCm: 18, widthCm: 13 },
  { id: 'a7800', maker: 'Atari', label: 'Atari 7800', bnf: /atari\s?7800/i, rawg: ['atari-7800'], thicknessMm: 30, heightCm: 18, widthCm: 13 },
  { id: 'atarist', maker: 'Atari', label: 'Atari ST', bnf: /atari\s?ST\b/i, rawg: ['atari-st'], thicknessMm: 40, heightCm: 22, widthCm: 17 },
  // Commodore (« Amiga CD32 » avant « Amiga »)
  { id: 'cd32', maker: 'Commodore', label: 'Amiga CD32', bnf: /amiga\s*CD\s?32|\bCD\s?32\b/i, rawg: [], thicknessMm: 25, heightCm: 19, widthCm: 14 },
  { id: 'amiga', maker: 'Commodore', label: 'Amiga', bnf: /amiga/i, rawg: ['commodore-amiga'], thicknessMm: 40, heightCm: 22, widthCm: 17 },
  { id: 'c64', maker: 'Commodore', label: 'Commodore 64', bnf: /commodore\s?64|\bC64\b/i, rawg: [], thicknessMm: 20, heightCm: 19, widthCm: 14 },
  // Autres fabricants
  { id: '3do', maker: 'Autres', label: '3DO', bnf: /\b3DO\b/i, rawg: ['3do'], thicknessMm: 15, heightCm: 19, widthCm: 14 },
  { id: 'cdi', maker: 'Autres', label: 'CD-i', bnf: /\bCD-?i\b|CD interacti/i, rawg: [], thicknessMm: 15, heightCm: 19, widthCm: 14 },
  { id: 'fmtowns', maker: 'Autres', label: 'FM Towns Marty', bnf: /fm[\s-]?towns/i, rawg: [], thicknessMm: 10, heightCm: 12.5, widthCm: 14.2 },
  { id: 'vectrex', maker: 'Autres', label: 'Vectrex', bnf: /vectrex/i, rawg: [], thicknessMm: 40, heightCm: 18, widthCm: 13 },
  { id: 'odyssey', maker: 'Autres', label: 'Odyssey 2 / Videopac', bnf: /videopac|magnavox|odyssey\s?(2|²)/i, rawg: [], thicknessMm: 30, heightCm: 18, widthCm: 13 },
  { id: 'coleco', maker: 'Autres', label: 'ColecoVision', bnf: /coleco\s?vision/i, rawg: [], thicknessMm: 40, heightCm: 20, widthCm: 14 },
  { id: 'intv', maker: 'Autres', label: 'Intellivision', bnf: /intellivision/i, rawg: [], thicknessMm: 30, heightCm: 18, widthCm: 13 },
  { id: 'pippin', maker: 'Autres', label: 'Apple Pippin', bnf: /pippin/i, rawg: [], thicknessMm: 10, heightCm: 12.5, widthCm: 14.2 },
  { id: 'loopy', maker: 'Autres', label: 'Casio Loopy', bnf: /loopy/i, rawg: [], thicknessMm: 30, heightCm: 15, widthCm: 11 },
  { id: 'ngage', maker: 'Autres', label: 'Nokia N-Gage', bnf: /n[\s-]?gage/i, rawg: [], thicknessMm: 14, heightCm: 15, widthCm: 10.5 },
  // Ordinateurs
  { id: 'cpc', maker: 'Ordinateurs', label: 'Amstrad CPC', bnf: /amstrad|\bCPC\b/i, rawg: [], thicknessMm: 20, heightCm: 19, widthCm: 14 },
  { id: 'msx', maker: 'Ordinateurs', label: 'MSX', bnf: /\bMSX\b/i, rawg: [], thicknessMm: 20, heightCm: 19, widthCm: 14 },
  { id: 'zx', maker: 'Ordinateurs', label: 'ZX Spectrum', bnf: /zx\s?spectrum/i, rawg: [], thicknessMm: 20, heightCm: 19, widthCm: 14 },
  { id: 'pc', maker: 'Ordinateurs', label: 'PC', bnf: /\bPC\b|windows|CD-ROM|DVD-ROM/i, rawg: ['pc'], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
  { id: 'autre', maker: 'Autres', label: 'Autre console', rawg: [], thicknessMm: 14, heightCm: 19, widthCm: 13.5 },
]

/** Version de cette liste : à augmenter quand on ajoute des consoles (voir settings.ts). */
export const PLATFORMS_VERSION = 2

/** Les fabricants, dans l'ordre d'affichage des listes de consoles. */
export const MAKERS = ['Sony', 'Nintendo', 'Microsoft', 'Sega', 'NEC', 'SNK', 'Bandai', 'Atari', 'Commodore', 'Autres', 'Ordinateurs'] as const
export type Maker = (typeof MAKERS)[number]

/**
 * Ordre d'affichage dans les listes : par date de sortie chez chaque fabricant
 * (la liste PLATFORMS, elle, est dans l'ordre de reconnaissance à la BnF).
 */
const DISPLAY_ORDER: Platform[] = [
  'ps1', 'ps2', 'psp', 'ps3', 'vita', 'ps4', 'ps5',
  'nes', 'gb', 'snes', 'vb', 'n64', 'gbc', 'gba', 'gc', 'nds', 'wii', '3ds', 'wiiu', 'switch', 'switch2',
  'xbox', 'x360', 'xone', 'xsx',
  'sg1000', 'sms', 'md', 'gg', 'megacd', 's32x', 'saturn', 'dc',
  'pce', 'sgx', 'pcecd', 'pcfx',
  'neogeo', 'neogeocd', 'ngp', 'ngpc',
  'playdia', 'ws', 'wsc',
  'a2600', 'a7800', 'atarist', 'lynx', 'jaguar',
  'c64', 'amiga', 'cd32',
  'intv', 'odyssey', 'coleco', 'vectrex', '3do', 'fmtowns', 'cdi', 'loopy', 'pippin', 'ngage',
  'zx', 'cpc', 'msx', 'pc', 'autre',
]
const rank = (id: Platform) => {
  const i = DISPLAY_ORDER.indexOf(id)
  return i < 0 ? DISPLAY_ORDER.length : i
}

/** Des consoles regroupées par fabricant (groupes vides retirés), dans l'ordre de MAKERS puis de sortie. */
export function byMaker(list: PlatformInfo[]): { maker: Maker; platforms: PlatformInfo[] }[] {
  return MAKERS.map((maker) => ({
    maker,
    platforms: list.filter((p) => p.maker === maker).sort((a, b) => rank(a.id) - rank(b.id)),
  })).filter((g) => g.platforms.length)
}

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
