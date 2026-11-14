import type { Cd } from '../db/types'
import { buildSlots, thicknessOf, type Furniture, type Slot } from './furniture'
import type { Insertion } from './insertion'

// Assistant de rangement : tout ce qu'affiche la fiche « Où le ranger » pour un CD.
//
// - Bloc 1 : l'emplacement cible (meuble, niveau, case, devant/derrière, position).
// - Bloc 2 : la liste THÉORIQUE = l'extrait du plan autour du CD (quelques CD avant et après),
//   avec pour chacun « rangé » ou « à ranger ».
// - Bloc 3 : la liste RÉELLE = ses voisins parmi les CD déjà posés dans la même rangée,
//   la consigne « place-le entre X et Y » et la place à laisser pour les CD encore à venir.
//
// « Le plan », ici, ce sont les emplacements enregistrés (dernier rangement appliqué + CD insérés depuis).

export interface PlanLine {
  cd: Cd
  isTarget: boolean
  /** Rangée de ce CD, si elle diffère de celle du CD cible (ex. « Billy · niveau 2 · devant »). */
  otherSlot?: string
}

export interface Gap {
  /** Nombre de CD prévus à cet endroit mais pas encore posés. */
  count: number
  /** Place à leur laisser, en mm. */
  mm: number
}

export interface RealNeighbours {
  /** CD déjà posé juste à gauche dans la rangée (absent = début de rangée). */
  before?: Cd
  /** CD déjà posé juste à droite dans la rangée (absent = fin de rangée). */
  after?: Cd
  /** Si personne n'est posé à gauche : CD posé le plus proche dans la rangée précédente. */
  nearestBefore?: { cd: Cd; slot: string }
  nearestAfter?: { cd: Cd; slot: string }
  /** Les voisins réels sont exactement ceux prévus par le plan. */
  sameAsPlan: boolean
  /** CD prévus entre le voisin de gauche (ou le début) et lui, pas encore posés. */
  gapBefore: Gap
  gapAfter: Gap
  /** Aucun autre CD n'est encore posé dans cette rangée. */
  emptyRow: boolean
  /** Où le poser dans une rangée vide, d'après sa place prévue. */
  hint: 'à gauche' | 'au centre' | 'à droite'
}

export interface Progress {
  done: number
  all: number
}

export interface WhereInfo {
  slot: Slot
  position: number
  /** Faux pour un CD ajouté après le rangement (place proposée, pas encore enregistrée). */
  located: boolean
  theoretical: PlanLine[]
  real: RealNeighbours
  progress: { total: Progress; furniture: Progress; row: Progress }
}

const gapOf = (cds: Cd[]): Gap => {
  const waiting = cds.filter((c) => !c.shelvedAt)
  return { count: waiting.length, mm: waiting.reduce((s, c) => s + thicknessOf(c), 0) }
}
const progressOf = (cds: Cd[]): Progress => ({ done: cds.filter((c) => c.shelvedAt).length, all: cds.length })

/**
 * Calcule la fiche « Où le ranger » d'un CD.
 * @param insertion place proposée pour un CD qui n'a pas encore d'emplacement (sinon null)
 * @param window nombre de CD affichés avant et après dans la liste théorique
 */
export function whereToShelve(
  target: Cd,
  all: Cd[],
  furniture: Furniture[],
  window = 2,
  insertion: Insertion | null = null,
): WhereInfo | null {
  const slots = buildSlots(furniture)
  const slotIndex = new Map(slots.map((s, i) => [s.id, i]))
  const slotOf = (cd: Cd) => (cd.id === target.id && !target.location ? insertion?.slot.id : cd.location?.slotId)

  // L'ordre du plan : rangée après rangée, de gauche à droite.
  const order = all
    .filter((c) => c.id !== target.id && c.location && slotIndex.has(c.location.slotId))
    .sort(
      (a, b) =>
        slotIndex.get(a.location!.slotId)! - slotIndex.get(b.location!.slotId)! ||
        a.location!.position - b.location!.position,
    )

  // Place du CD cible dans cet ordre.
  let slot: Slot
  let position: number
  let index: number
  if (target.location && slotIndex.has(target.location.slotId)) {
    slot = slots[slotIndex.get(target.location.slotId)!]
    position = target.location.position
    const t = slotIndex.get(slot.id)!
    index = order.findIndex(
      (c) => slotIndex.get(c.location!.slotId)! > t || (c.location!.slotId === slot.id && c.location!.position > position),
    )
  } else if (insertion) {
    slot = insertion.slot
    position = insertion.position
    index = insertion.after
      ? order.findIndex((c) => c.id === insertion.after!.id) + 1
      : insertion.before
        ? order.findIndex((c) => c.id === insertion.before!.id)
        : -1
  } else {
    return null
  }
  if (index < 0) index = order.length
  const seq = [...order.slice(0, index), target, ...order.slice(index)]
  const i = index

  // Bloc 2 : liste théorique
  const theoretical: PlanLine[] = seq.slice(Math.max(0, i - window), i + window + 1).map((cd) => {
    const s = slotOf(cd)
    return {
      cd,
      isTarget: cd.id === target.id,
      otherSlot: s && s !== slot.id ? slots[slotIndex.get(s)!]?.label : undefined,
    }
  })

  // Bloc 3 : liste réelle (dans la même rangée)
  const row = seq.filter((cd) => slotOf(cd) === slot.id)
  const j = row.findIndex((cd) => cd.id === target.id)
  const left = row.slice(0, j)
  const right = row.slice(j + 1)
  const before = [...left].reverse().find((c) => c.shelvedAt)
  const after = right.find((c) => c.shelvedAt)
  const between = (from: Cd[], to: Cd | undefined, fromEnd: boolean) => {
    // CD situés entre le voisin réel et la cible (côté gauche) ou entre la cible et le voisin réel (côté droit).
    if (fromEnd) return to ? from.slice(from.indexOf(to) + 1) : from
    return to ? from.slice(0, from.indexOf(to)) : from
  }
  const nearest = (list: Cd[]) => {
    const cd = list.find((c) => c.shelvedAt)
    return cd ? { cd, slot: slots[slotIndex.get(slotOf(cd)!)!].label } : undefined
  }
  const rowStart = seq.indexOf(row[0])
  const rowEnd = seq.indexOf(row[row.length - 1])
  const ratio = row.length > 1 ? j / (row.length - 1) : 0.5

  const real: RealNeighbours = {
    before,
    after,
    nearestBefore: before ? undefined : nearest([...seq.slice(0, rowStart)].reverse()),
    nearestAfter: after ? undefined : nearest(seq.slice(rowEnd + 1)),
    sameAsPlan: before?.id === left.at(-1)?.id && after?.id === right[0]?.id,
    gapBefore: gapOf(between(left, before, true)),
    gapAfter: gapOf(between(right, after, false)),
    emptyRow: !row.some((c) => c.id !== target.id && c.shelvedAt),
    hint: ratio < 1 / 3 ? 'à gauche' : ratio > 2 / 3 ? 'à droite' : 'au centre',
  }

  // Progression (sur les CD qui ont un emplacement)
  const located = [...order, ...(target.location ? [target] : [])]
  return {
    slot,
    position,
    located: !!target.location,
    theoretical,
    real,
    progress: {
      total: progressOf(located),
      furniture: progressOf(located.filter((c) => c.location!.furnitureId === slot.furnitureId)),
      row: progressOf(located.filter((c) => c.location!.slotId === slot.id)),
    },
  }
}
