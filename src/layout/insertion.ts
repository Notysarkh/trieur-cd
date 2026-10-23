import type { Cd } from '../db/types'
import { buildSlots, thicknessOf, type Furniture, type Slot } from './furniture'

// Insertion d'un nouveau CD SANS tout recalculer.
//
// Une fois le rangement appliqué, chaque CD a un emplacement enregistré. Pour un nouveau CD,
// on regarde où il tombe dans l'ordre du classement, puis on le place juste après son voisin
// de gauche (ou juste avant son voisin de droite) dans les meubles. Seuls les CD de cette rangée
// glissent d'une place : les autres rangées ne bougent pas. La marge de croissance prévue à
// l'étape 3 sert exactement à ça.

export interface Insertion {
  slot: Slot
  /** Position dans la rangée (1 = le plus à gauche). */
  position: number
  /** CD juste à gauche et juste à droite de la place proposée. */
  after?: Cd
  before?: Cd
  /** Reste-t-il physiquement la place dans cette rangée ? */
  fits: boolean
  /** Place libre dans la rangée avant l'insertion, en mm. */
  freeMm: number
}

/**
 * Propose une place pour `cd`.
 * @param order tous les CD dans l'ordre du classement actuel (le nouveau compris)
 * @param placed les CD qui ont déjà un emplacement enregistré
 * @param themeOf thème d'un CD dans le classement actuel
 * @returns null si aucun CD n'est encore rangé (il faut d'abord appliquer un rangement)
 */
export function suggestInsertion(
  cd: Cd,
  order: Cd[],
  placed: Cd[],
  furniture: Furniture[],
  themeOf: (cd: Cd) => string | undefined,
): Insertion | null {
  const slots = new Map(buildSlots(furniture).map((s) => [s.id, s]))
  const located = placed.filter((c) => c.id !== cd.id && c.location && slots.has(c.location.slotId))
  const bySlot = new Map<string, Cd[]>()
  for (const c of located) bySlot.set(c.location!.slotId, [...(bySlot.get(c.location!.slotId) ?? []), c])
  for (const list of bySlot.values()) list.sort((a, b) => a.location!.position - b.location!.position)
  const isLocated = new Set(located.map((c) => c.id))

  const i = order.findIndex((c) => c.id === cd.id)
  if (i < 0 || !located.length) return null
  let prev: Cd | undefined
  for (let k = i - 1; k >= 0 && !prev; k--) if (isLocated.has(order[k].id)) prev = order[k]
  let next: Cd | undefined
  for (let k = i + 1; k < order.length && !next; k++) if (isLocated.has(order[k].id)) next = order[k]

  const used = (slotId: string) => (bySlot.get(slotId) ?? []).reduce((s, c) => s + thicknessOf(c), 0)
  const make = (slotId: string, position: number): Insertion => {
    const slot = slots.get(slotId)!
    const list = bySlot.get(slotId) ?? []
    const freeMm = slot.capacityMm - used(slotId)
    return {
      slot,
      position,
      after: [...list].reverse().find((c) => c.location!.position < position),
      before: list.find((c) => c.location!.position >= position),
      fits: thicknessOf(cd) <= freeMm + 0.01,
      freeMm,
    }
  }

  const afterPrev = prev ? make(prev.location!.slotId, prev.location!.position + 1) : undefined
  const beforeNext = next ? make(next.location!.slotId, next.location!.position) : undefined
  // On préfère le voisin du même thème ; à égalité, celui de gauche.
  const theme = themeOf(cd)
  const prevSame = prev && themeOf(prev) === theme
  const nextSame = next && themeOf(next) === theme
  const candidates = (!prevSame && nextSame ? [beforeNext, afterPrev] : [afterPrev, beforeNext]).filter(
    (x): x is Insertion => !!x,
  )
  // La première proposition qui a de la place ; sinon la première (il faudra décaler un peu).
  return candidates.find((c) => c.fits) ?? candidates[0] ?? null
}
