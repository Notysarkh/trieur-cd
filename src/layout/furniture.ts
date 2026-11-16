import type { Cd } from '../db/types'
import { mediaOf, type MediaKind } from '../lib/media'
import { platformInfo } from '../lib/platforms'
import { VIDEO_FORMATS } from '../lib/videoFormats'
import { musicFormatInfo } from '../lib/musicFormats'

// Les meubles et leurs « cases ».
//
// Vocabulaire :
// - un meuble a des NIVEAUX (tablettes, de haut en bas) et éventuellement plusieurs COLONNES (Kallax) ;
// - une case = un niveau × une colonne ;
// - une case peut recevoir 2 rangées l'une derrière l'autre (« double rangée ») si la profondeur le permet,
//   et/ou 2 couches superposées si la hauteur le permet ;
// - une RANGÉE = une ligne de CD posés debout côte à côte : c'est l'unité de remplissage.

/** Dimensions d'un boîtier CD standard posé debout, tranche visible (en mm). */
export const CD_DEPTH_MM = 142
export const CD_HEIGHT_MM = 125
export const STANDARD_THICKNESS_MM = 10.4

export interface Furniture {
  id: string
  name: string
  /** Modèle d'origine (pour mémoire). */
  model: string
  /** Nombre de niveaux (tablettes), numérotés de haut en bas. */
  levels: number
  /** Nombre de cases par niveau (1 pour une étagère classique, 4 pour un Kallax 4 × 4). */
  columns: number
  /** Largeur utile d'une case, en cm. */
  innerWidthCm: number
  /** Hauteur utile d'une case, en cm. */
  innerHeightCm: number
  /** Profondeur utile, en cm. */
  depthCm: number
  /** Rangées l'une derrière l'autre (2 = double rangée). */
  depthRows: 1 | 2
  /** Couches superposées dans la hauteur. */
  layers: 1 | 2
  /** Cases réservées à autre chose (déco, objets…), sous la forme « niveau-colonne », ex. « 3-1 ». */
  reserved: string[]
  /** Univers rangé dans ce meuble (v2) ; absent = CD. */
  media?: MediaKind
  /** Cases attribuées à un autre univers que celui du meuble (« 1-1 » → films), pour un meuble partagé. */
  caseMedia?: Record<string, MediaKind>
  /**
   * Position des objets : « debout » (par défaut, comme des livres sur une étagère : la hauteur de l'objet
   * occupe la hauteur de la case) ou « couche », tranche vers le haut (tiroirs, bacs : c'est la LARGEUR
   * de l'objet qui occupe la hauteur). Les objets restent côte à côte dans la rangée : la place est la même.
   */
  orientation?: Orientation
}

export type Orientation = 'debout' | 'couche'

export const ORIENTATIONS: { id: Orientation; label: string }[] = [
  { id: 'debout', label: 'Debout (la hauteur de l\'objet occupe la hauteur)' },
  { id: 'couche', label: 'Couchés, tranche vers le haut (la largeur occupe la hauteur)' },
]

export const isLying = (f: Pick<Furniture, 'orientation'>): boolean => f.orientation === 'couche'

/** Une rangée de CD : l'unité que l'algorithme remplit. */
export interface Slot {
  id: string
  furnitureId: string
  furnitureName: string
  level: number
  column: number
  /** 1 = couche du haut, 2 = couche du bas. */
  layer: number
  /** 1 = devant, 2 = derrière. */
  depthRow: number
  capacityMm: number
  /** Ex. « Billy · niveau 3 · derrière ». */
  label: string
}

export interface LayoutOptions {
  /** Marge de croissance par thème, en % (place laissée libre pour les futurs CD). */
  marginPct: number
  /** Chaque thème commence dans une nouvelle rangée (plus lisible, mais prend plus de place). */
  themeStartsNewSlot: boolean
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = { marginPct: 15, themeStartsNewSlot: false }

// ---------------------------------------------------------------------------
// Bibliothèque de modèles
// ---------------------------------------------------------------------------

export type FurnitureModel = Omit<Furniture, 'id' | 'reserved'> & { key: string; note: string }

// HYPOTHÈSES : dimensions utiles approximatives (épaisseur des planches déduite). À vérifier au mètre.
export const MODELS: FurnitureModel[] = [
  {
    key: 'meuble-cd',
    model: 'Meuble CD',
    name: 'Meuble CD',
    levels: 11,
    columns: 1,
    innerWidthCm: 41,
    innerHeightCm: 13.5,
    depthCm: 15,
    depthRows: 1,
    layers: 1,
    note: 'Ton meuble : 43 × 15 × 157 cm, 11 niveaux, 41 cm utiles en largeur.',
  },
  {
    key: 'billy-80',
    model: 'Billy 80 × 202',
    name: 'Billy',
    levels: 6,
    columns: 1,
    innerWidthCm: 76,
    innerHeightCm: 30,
    depthCm: 26,
    depthRows: 1,
    layers: 1,
    note: 'IKEA Billy 80 × 28 × 202 cm.',
  },
  {
    key: 'billy-40',
    model: 'Billy 40 × 202',
    name: 'Billy étroit',
    levels: 6,
    columns: 1,
    innerWidthCm: 36,
    innerHeightCm: 30,
    depthCm: 26,
    depthRows: 1,
    layers: 1,
    note: 'IKEA Billy 40 × 28 × 202 cm.',
  },
  {
    key: 'kallax-4x4',
    model: 'Kallax 4 × 4',
    name: 'Kallax',
    levels: 4,
    columns: 4,
    innerWidthCm: 33,
    innerHeightCm: 33,
    depthCm: 37,
    depthRows: 2,
    layers: 1,
    note: 'IKEA Kallax 147 × 147 cm : cases de 33 × 33 cm, assez profondes pour 2 rangées.',
  },
  {
    key: 'kallax-2x4',
    model: 'Kallax 2 × 4',
    name: 'Kallax',
    levels: 4,
    columns: 2,
    innerWidthCm: 33,
    innerHeightCm: 33,
    depthCm: 37,
    depthRows: 2,
    layers: 1,
    note: 'IKEA Kallax 77 × 147 cm.',
  },
  {
    key: 'kallax-1x4',
    model: 'Kallax 1 × 4',
    name: 'Kallax colonne',
    levels: 4,
    columns: 1,
    innerWidthCm: 33,
    innerHeightCm: 33,
    depthCm: 37,
    depthRows: 2,
    layers: 1,
    note: 'IKEA Kallax 42 × 147 cm.',
  },
  {
    key: 'generique',
    model: 'Étagère générique',
    name: 'Étagère',
    levels: 5,
    columns: 1,
    innerWidthCm: 80,
    innerHeightCm: 30,
    depthCm: 25,
    depthRows: 1,
    layers: 1,
    note: 'À adapter à ton meuble.',
  },
]

export function furnitureFromModel(m: FurnitureModel, id: string): Furniture {
  return {
    id,
    name: m.name,
    model: m.model,
    levels: m.levels,
    columns: m.columns,
    innerWidthCm: m.innerWidthCm,
    innerHeightCm: m.innerHeightCm,
    depthCm: m.depthCm,
    depthRows: m.depthRows,
    layers: m.layers,
    reserved: [],
  }
}

/**
 * Tes meubles, d'après tes indications :
 * - le meuble CD en premier (« priorité 1 ») : 11 niveaux, 41 cm utiles, 15 cm de profondeur ;
 * - le Billy ensuite : 6 tablettes, en double rangée.
 * HYPOTHÈSES à confirmer : Billy de 80 cm de large (76 cm utiles), 26 cm de profondeur utile,
 * toutes les tablettes pour les CD (« utilisation mixte » : marque les tablettes réservées à autre chose).
 */
export function defaultFurniture(): Furniture[] {
  const cd = furnitureFromModel(MODELS[0], 'meuble-cd')
  const billy = { ...furnitureFromModel(MODELS[1], 'billy'), depthRows: 2 as const }
  return [cd, billy]
}

/**
 * v2, étape E : les meubles des autres univers, ajoutés une seule fois à tes meubles existants.
 * Identifiants FIXES : l'emplacement d'un objet contient l'identifiant de son meuble, et le téléphone
 * et le PC font chacun cet ajout avant d'échanger leurs sauvegardes.
 * - Billy, niveau 1 : il passe aux films s'il était réservé à « autre chose » (c'est là que sont tes films) ;
 * - livres : 2 grandes Billy (80 cm) et une demie (40 cm), une seule rangée ;
 * - jeux : « Rangement jeux », copie du meuble CD (dimensions à corriger dans « Mes meubles »).
 * Rien d'autre ne change dans tes meubles : les CD gardent exactement leurs rangées.
 */
export function addV2Furniture(list: Furniture[]): Furniture[] {
  const out: Furniture[] = list.map((f) => {
    if (f.id !== 'billy' || !f.reserved.includes('1-1')) return f
    return { ...f, reserved: f.reserved.filter((k) => k !== '1-1'), caseMedia: { ...f.caseMedia, '1-1': 'video' } }
  })
  const add = (f: Furniture) => {
    if (!out.some((x) => x.id === f.id)) out.push(f)
  }
  add({ ...furnitureFromModel(MODELS[1], 'billy-livres-1'), name: 'Billy livres 1', media: 'livre' })
  add({ ...furnitureFromModel(MODELS[1], 'billy-livres-2'), name: 'Billy livres 2', media: 'livre' })
  add({ ...furnitureFromModel(MODELS[2], 'billy-livres-demie'), name: 'Billy livres (demie)', media: 'livre' })
  add({ ...furnitureFromModel(MODELS[0], 'rangement-jeux'), name: 'Rangement jeux', model: 'Copie du meuble CD', media: 'jeu' })
  return out
}

// ---------------------------------------------------------------------------
// Meubles partagés entre univers
// ---------------------------------------------------------------------------

/** L'univers d'une case : celui attribué à la case, sinon celui du meuble (CD par défaut). */
export function caseMediaOf(f: Furniture, level: number, column: number): MediaKind {
  return f.caseMedia?.[caseKey(level, column)] ?? f.media ?? 'cd'
}

/**
 * Les meubles vus par un univers : les cases des autres univers sont traitées comme réservées.
 * Les meubles sans aucune case pour cet univers disparaissent ; l'ordre de remplissage est conservé.
 * Sert seulement aux calculs : cette liste n'est jamais enregistrée.
 */
export function furnitureFor(furniture: Furniture[], media: MediaKind): Furniture[] {
  return furniture.flatMap((f) => {
    const reserved = [...f.reserved]
    let free = 0
    for (let level = 1; level <= f.levels; level++) {
      for (let column = 1; column <= f.columns; column++) {
        const key = caseKey(level, column)
        if (reserved.includes(key)) continue
        if (caseMediaOf(f, level, column) !== media) reserved.push(key)
        else free++
      }
    }
    return free ? [{ ...f, reserved }] : []
  })
}

/** Hauteur d'un objet en cm (musique sans hauteur connue : selon le support ; CD : boîtier standard de 12,5 cm). */
export function heightOf(cd: Cd): number {
  if (cd.heightCm && cd.heightCm > 0) return cd.heightCm
  return mediaOf(cd) === 'cd' ? musicFormatInfo(cd.musicFormat).heightCm : 0
}

/**
 * Largeur d'un objet en cm, d'après son type de boîtier (0 = inconnue : pas de contrôle).
 * HYPOTHÈSES : boîtier CD 14,2 cm ; films : selon le support (lib/videoFormats.ts) ; jeux : selon la console. Livres : inconnue.
 */
export function widthOf(cd: Cd): number {
  const media = mediaOf(cd)
  if (media === 'cd') return musicFormatInfo(cd.musicFormat).widthCm
  if (media === 'video') return VIDEO_FORMATS[cd.videoFormat ?? 'dvd']?.widthCm ?? 0
  if (media === 'jeu') return platformInfo(cd.platform ?? 'autre')?.widthCm ?? 0
  return 0
}

/** Ce qu'un objet occupe dans la hauteur d'une case de ce meuble (debout : sa hauteur ; couché : sa largeur). */
export function verticalSizeOf(cd: Cd, f: Pick<Furniture, 'orientation'>): number {
  return isLying(f) ? widthOf(cd) : heightOf(cd)
}

// ---------------------------------------------------------------------------
// Rangées et capacité
// ---------------------------------------------------------------------------

const caseKey = (level: number, column: number) => `${level}-${column}`

/** Toutes les rangées disponibles, dans l'ordre de lecture : meuble par meuble, de haut en bas, de gauche à droite. */
export function buildSlots(furniture: Furniture[]): Slot[] {
  const slots: Slot[] = []
  for (const f of furniture) {
    for (let level = 1; level <= f.levels; level++) {
      for (let column = 1; column <= f.columns; column++) {
        if (f.reserved.includes(caseKey(level, column))) continue
        for (let layer = 1; layer <= f.layers; layer++) {
          for (let depthRow = 1; depthRow <= f.depthRows; depthRow++) {
            const parts = [f.name, `niveau ${level}`]
            if (f.columns > 1) parts.push(`case ${column}`)
            if (f.layers > 1) parts.push(layer === 1 ? 'couche du haut' : 'couche du bas')
            if (f.depthRows > 1) parts.push(depthRow === 1 ? 'devant' : 'derrière')
            slots.push({
              id: `${f.id}:${level}-${column}-${layer}-${depthRow}`,
              furnitureId: f.id,
              furnitureName: f.name,
              level,
              column,
              layer,
              depthRow,
              capacityMm: Math.max(0, f.innerWidthCm * 10),
              label: parts.join(' · '),
            })
          }
        }
      }
    }
  }
  return slots
}

/** Capacité d'un meuble, en mm de rangée et en équivalent CD standard. */
export function furnitureCapacity(f: Furniture): { mm: number; standardCds: number; perRow: number } {
  const perRow = Math.floor((f.innerWidthCm * 10) / STANDARD_THICKNESS_MM)
  const rows = buildSlots([f]).length
  return { mm: rows * f.innerWidthCm * 10, standardCds: rows * perRow, perRow }
}

/** Ce qui ne colle pas physiquement dans la configuration d'un meuble. */
export function furnitureWarnings(f: Furniture): string[] {
  const w: string[] = []
  // Ces vérifications concernent les boîtiers CD : sans aucune case pour les CD, rien à signaler ici
  // (la hauteur des livres, films et jeux est vérifiée objet par objet dans le rangement).
  if (!furnitureFor([f], 'cd').length) return w
  // Couché, tranche vers le haut : la largeur du boîtier (14,2 cm) est à la verticale, sa hauteur (12,5 cm) en profondeur.
  const lying = isLying(f)
  const depthMm = lying ? CD_HEIGHT_MM : CD_DEPTH_MM
  const upMm = lying ? CD_DEPTH_MM : CD_HEIGHT_MM
  const cm = (mm: number) => String(mm / 10).replace('.', ',')
  const neededDepth = (f.depthRows * depthMm) / 10
  if (f.depthCm < neededDepth) {
    const over = (neededDepth - f.depthCm).toFixed(1).replace('.', ',')
    w.push(
      f.depthRows > 1
        ? `Double rangée : il faut ${String(neededDepth).replace('.', ',')} cm de profondeur, il y en a ${f.depthCm} : les CD de devant dépasseront d'environ ${over} cm.`
        : `Profondeur de ${f.depthCm} cm : un boîtier (${cm(depthMm)} cm) dépassera d'environ ${over} cm.`,
    )
  }
  const neededHeight = (f.layers * upMm) / 10
  if (f.innerHeightCm < neededHeight) {
    w.push(
      f.layers > 1
        ? `Deux couches demandent au moins ${String(neededHeight).replace('.', ',')} cm de hauteur utile (il y en a ${f.innerHeightCm}).`
        : lying
          ? `Hauteur de ${f.innerHeightCm} cm : un boîtier standard couché (14,2 cm de large) dépasse.`
          : `Hauteur de ${f.innerHeightCm} cm : un boîtier standard (12,5 cm) ne tient pas debout.`,
    )
  }
  if (f.layers === 1 && f.innerHeightCm >= 2 * (upMm / 10) + 1) {
    w.push(`La hauteur (${f.innerHeightCm} cm) permettrait 2 couches de CD avec un petit plateau intermédiaire.`)
  }
  return w
}

/** Épaisseur d'un CD en mm (avec repli sur le standard si la fiche est incomplète). */
export function thicknessOf(cd: Cd): number {
  return cd.thicknessMm > 0 ? cd.thicknessMm : STANDARD_THICKNESS_MM
}
