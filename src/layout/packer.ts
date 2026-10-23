import type { Plan, PlanTheme } from '../classification/engine'
import type { ThemeDef } from '../classification/themes'
import type { Cd } from '../db/types'
import { buildSlots, CD_DEPTH_MM, STANDARD_THICKNESS_MM, thicknessOf, type Furniture, type LayoutOptions, type Slot } from './furniture'

// Répartition des CD dans les meubles, rangée par rangée.
//
// Principe : on suit l'ordre du classement (thème → artiste → albums) et on remplit les rangées
// dans l'ordre de lecture (meuble par meuble, de haut en bas, de gauche à droite, devant puis derrière).
// - Marge de croissance : chaque rangée n'est remplie qu'à 1 / (1 + marge). Avec 15 %, une rangée
//   de 41 cm reçoit au plus 35,7 cm de CD : il reste de la place PARTOUT dans chaque thème pour
//   insérer un futur CD à sa place sans tout décaler.
// - Un artiste n'est pas coupé entre deux rangées si on peut l'éviter : s'il ne tient pas en entier,
//   il passe à la rangée suivante… sauf si cela laissait plus d'un tiers de la rangée vide
//   (ou s'il est trop grand pour une seule rangée) : on le coupe alors, et c'est signalé.
// - Les thèmes se suivent sans trou (option : chaque thème commence dans une nouvelle rangée).

export interface SlotContent {
  slot: Slot
  /** Les CD de la rangée, de gauche à droite. */
  cds: Cd[]
  usedMm: number
  /** Thèmes présents dans la rangée et place occupée par chacun. */
  themes: { theme: ThemeDef; mm: number }[]
  /** Premier et dernier artiste (ou titre / compositeur selon le thème). */
  first?: string
  last?: string
}

export interface ThemeRange {
  theme: ThemeDef
  cdCount: number
  /** Indices (dans `slots`) de la première et de la dernière rangée du thème. */
  from: number
  to: number
}

export interface CutBlock {
  label: string
  theme: ThemeDef
  slotLabels: string[]
}

export interface Layout {
  slots: SlotContent[]
  /** CD sans place (meubles trop petits). */
  overflow: Cd[]
  /** Artistes coupés entre plusieurs rangées. */
  cuts: CutBlock[]
  themeRanges: ThemeRange[]
  capacityMm: number
  /** Épaisseur totale des CD à ranger. */
  neededMm: number
  emptySlots: number
  /** Conseils en clair (surcharge, rangées vides…). */
  suggestions: string[]
  /** Pour chaque CD : rangée et position (1 = le plus à gauche). */
  placement: Map<string, { furnitureId: string; slotId: string; position: number }>
  durationMs: number
}

/** Au-delà de cette part de rangée laissée vide, on préfère couper un artiste. */
const CUT_THRESHOLD = 0.35

interface Block {
  theme: ThemeDef
  label: string
  cds: Cd[]
}

/** Découpe un thème en blocs insécables si possible : un artiste, un compositeur, ou un CD (tri par titre). */
function blocksOf(t: PlanTheme): Block[] {
  const name = new Map<string, string>()
  const key = new Map<string, string>()
  for (const a of t.artists) {
    for (const cd of a.cds) {
      name.set(cd.id, a.name)
      key.set(cd.id, a.key)
    }
  }
  const keyOf = (cd: Cd) =>
    t.theme.sortBy === 'titre'
      ? cd.id
      : t.theme.sortBy === 'compositeur'
        ? cd.composer?.trim() || key.get(cd.id)!
        : key.get(cd.id)!
  const labelOf = (cd: Cd) =>
    t.theme.sortBy === 'titre'
      ? cd.title
      : t.theme.sortBy === 'compositeur'
        ? cd.composer?.trim() || name.get(cd.id)!
        : name.get(cd.id)!

  const blocks: (Block & { key: string })[] = []
  for (const cd of t.cds) {
    const k = keyOf(cd)
    const last = blocks.at(-1)
    if (last && last.key === k) last.cds.push(cd)
    else blocks.push({ key: k, theme: t.theme, label: labelOf(cd), cds: [cd] })
  }
  return blocks
}

const width = (cds: Cd[]) => cds.reduce((sum, cd) => sum + thicknessOf(cd), 0)

/** Le calcul de répartition lui-même (sans les conseils). */
function pack(plan: Plan, slots: Slot[], options: LayoutOptions) {
  const content: SlotContent[] = slots.map((slot) => ({ slot, cds: [], usedMm: 0, themes: [] }))
  const ratio = 1 / (1 + Math.max(0, options.marginPct) / 100)
  const limit = (i: number) => content[i].slot.capacityMm * ratio
  const overflow: Cd[] = []
  const cuts: CutBlock[] = []
  const EPS = 0.01

  const put = (i: number, cd: Cd, block: Block) => {
    const c = content[i]
    c.cds.push(cd)
    c.usedMm += thicknessOf(cd)
    const entry = c.themes.find((x) => x.theme.id === block.theme.id)
    if (entry) entry.mm += thicknessOf(cd)
    else c.themes.push({ theme: block.theme, mm: thicknessOf(cd) })
    c.first ??= block.label
    c.last = block.label
  }

  let si = 0
  for (const t of plan.themes) {
    if (options.themeStartsNewSlot && si < content.length && content[si].cds.length) si++
    for (const block of blocksOf(t)) {
      let rest = block.cds
      const used: number[] = []
      while (rest.length) {
        if (si >= content.length) {
          overflow.push(...rest)
          break
        }
        const c = content[si]
        const free = limit(si) - c.usedMm
        const restWidth = width(rest)
        if (restWidth <= free + EPS) {
          rest.forEach((cd) => put(si, cd, block))
          used.push(si)
          break
        }
        // L'artiste ne tient pas en entier ici. Tient-il en entier dans la rangée suivante ?
        const nextLimit = si + 1 < content.length ? limit(si + 1) : 0
        if (c.cds.length && restWidth <= nextLimit + EPS && free / c.slot.capacityMm < CUT_THRESHOLD) {
          si++
          continue
        }
        // Sinon on remplit ce qui tient et la suite continue dans la rangée suivante.
        let placed = 0
        while (placed < rest.length && thicknessOf(rest[placed]) <= limit(si) - content[si].usedMm + EPS) {
          put(si, rest[placed], block)
          placed++
        }
        if (placed) used.push(si)
        rest = rest.slice(placed)
        si++
      }
      if (new Set(used).size > 1) {
        cuts.push({ label: block.label, theme: block.theme, slotLabels: [...new Set(used)].map((i) => content[i].slot.label) })
      }
    }
  }
  return { content, overflow, cuts }
}

/** Plus grande marge (en %, entre `low` et `high`) qui permet encore de tout ranger, ou null. */
function bestMargin(plan: Plan, slots: Slot[], options: LayoutOptions, low: number, high: number): number | null {
  const fits = (m: number) => pack(plan, slots, { ...options, marginPct: m }).overflow.length === 0
  if (!fits(low)) return null
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2)
    if (fits(mid)) low = mid
    else high = mid
  }
  return fits(high) ? high : low
}

export function packLayout(plan: Plan, furniture: Furniture[], options: LayoutOptions): Layout {
  const start = Date.now()
  const slots = buildSlots(furniture)
  const { content, overflow, cuts } = pack(plan, slots, options)

  const placement = new Map<string, { furnitureId: string; slotId: string; position: number }>()
  for (const c of content) {
    c.cds.forEach((cd, i) => placement.set(cd.id, { furnitureId: c.slot.furnitureId, slotId: c.slot.id, position: i + 1 }))
  }

  const themeRanges: ThemeRange[] = []
  for (const t of plan.themes) {
    const indices = content.flatMap((c, i) => (c.themes.some((x) => x.theme.id === t.theme.id) ? [i] : []))
    if (indices.length) themeRanges.push({ theme: t.theme, cdCount: t.cds.length, from: indices[0], to: indices.at(-1)! })
  }

  const capacityMm = slots.reduce((s, x) => s + x.capacityMm, 0)
  const neededMm = width(plan.themes.flatMap((t) => t.cds))
  const emptySlots = content.filter((c) => !c.cds.length).length

  // --- Conseils ---
  const suggestions: string[] = []
  const cm = (mm: number) => Math.round(mm / 10)
  if (overflow.length) {
    suggestions.push(`${overflow.length} CD ne trouvent pas de place avec ces réglages.`)
    const m = bestMargin(plan, slots, options, 0, Math.max(0, options.marginPct - 1))
    if (m !== null) {
      suggestions.push(`Avec une marge de croissance de ${m} % au lieu de ${options.marginPct} %, tout rentre.`)
    } else {
      const atZero = pack(plan, slots, { ...options, marginPct: 0 })
      const missing = width(atZero.overflow)
      suggestions.push(
        `Même sans marge, il manque environ ${cm(missing)} cm de rangée (≈ ${Math.ceil(missing / STANDARD_THICKNESS_MM)} CD standard).`,
      )
    }
    for (const f of furniture) {
      if (f.depthRows === 1 && f.depthCm * 10 >= 2 * CD_DEPTH_MM - 25) {
        suggestions.push(`Passe « ${f.name} » en double rangée (profondeur ${f.depthCm} cm).`)
      }
    }
    if (options.themeStartsNewSlot) suggestions.push('Décoche « chaque thème dans une nouvelle rangée » pour gagner de la place.')
    if (furniture.some((f) => f.reserved.length)) suggestions.push('Libère une case réservée à autre chose.')
  } else if (emptySlots >= 2) {
    const m = bestMargin(plan, slots, options, options.marginPct, 300)
    suggestions.push(`${emptySlots} rangées restent vides à la fin.`)
    if (m !== null && m > options.marginPct + 2) {
      suggestions.push(`Tu peux monter la marge de croissance jusqu'à ${m} % pour aérer toutes les rangées.`)
    }
    if (!options.themeStartsNewSlot) {
      suggestions.push('Ou coche « chaque thème dans une nouvelle rangée » pour des séparations plus nettes.')
    }
  }
  if (cuts.length) {
    suggestions.push(`${cuts.length} artiste(s) à cheval sur deux rangées (trop grands pour une rangée, ou pour éviter un trou).`)
  }

  return {
    slots: content,
    overflow,
    cuts,
    themeRanges,
    capacityMm,
    neededMm,
    emptySlots,
    suggestions,
    placement,
    durationMs: Date.now() - start,
  }
}
