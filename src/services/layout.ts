import type { Plan } from '../classification/engine'
import { db } from '../db/database'
import type { Cd } from '../db/types'
import { suggestInsertion, type Insertion } from '../layout/insertion'
import { packLayout, type Layout } from '../layout/packer'
import { applyPlan } from './classification'
import { saveSetting, settings } from './settings'

// Lien entre l'algorithme de répartition et la base : calcul, application, emplacement d'un CD.

export function computeLayout(plan: Plan): Layout {
  return packLayout(plan, settings.furniture, settings.layout)
}

export interface Moves {
  /** CD pas encore rangés (nouveaux) qui recevraient une place. */
  added: number
  /** CD qui changeraient de rangée : ce sont eux qu'il faudrait déplacer physiquement. */
  otherRow: number
  /** CD qui restent dans leur rangée mais glissent d'une ou plusieurs places (insertion à côté). */
  shifted: number
  /** CD qui perdraient leur place (surcharge). */
  removed: number
  total: number
}

/** Ce qui changerait si on appliquait cette répartition, par rapport à celle déjà appliquée. */
export function countMoves(layout: Layout, cds: Cd[]): Moves {
  const m: Moves = { added: 0, otherRow: 0, shifted: 0, removed: 0, total: 0 }
  for (const cd of cds) {
    const p = layout.placement.get(cd.id)
    const loc = cd.location
    if (!p && !loc) continue
    if (!loc) m.added++
    else if (!p) m.removed++
    else if (p.slotId !== loc.slotId) m.otherRow++
    else if (p.position !== loc.position) m.shifted++
    else continue
    m.total++
  }
  return m
}

/**
 * Applique le classement ET la répartition : chaque CD reçoit son thème, son rang et son emplacement.
 * Les CD sans place perdent leur emplacement. Seuls les CD modifiés voient leur date de modification
 * changer (utile pour la synchro téléphone ↔ PC).
 */
export async function applyLayout(plan: Plan, layout: Layout): Promise<void> {
  await applyPlan(plan)
  const now = Date.now()
  const cds = await db.cds.toArray()
  const updates = cds.flatMap((cd) => {
    const p = layout.placement.get(cd.id)
    if (p?.slotId === cd.location?.slotId && p?.position === cd.location?.position) return []
    return [{ key: cd.id, changes: { location: p, updatedAt: now } }]
  })
  await db.cds.bulkUpdate(updates)
  await saveSetting('layoutAppliedAt', now)
}

/** Emplacement court, pour les listes : « Billy · niv. 3 · derrière · n° 12 ». */
export function shortLocation(cd: Cd): string | null {
  const loc = cd.location
  const f = loc && settings.furniture.find((x) => x.id === loc.furnitureId)
  if (!loc || !f) return null
  const [level, column, layer, depthRow] = loc.slotId.split(':')[1].split('-').map(Number)
  const parts = [f.name, `niv. ${level}`]
  if (f.columns > 1) parts.push(`case ${column}`)
  if (f.layers > 1) parts.push(layer === 1 ? 'haut' : 'bas')
  if (f.depthRows > 1) parts.push(depthRow === 1 ? 'devant' : 'derrière')
  parts.push(`n° ${loc.position}`)
  return parts.join(' · ')
}

/** Où glisser un CD pas encore rangé (null si aucun rangement n'a encore été appliqué). */
export function insertionFor(cd: Cd, plan: Plan, cds: Cd[]): Insertion | null {
  const order = plan.themes.flatMap((t) => t.cds)
  return suggestInsertion(cd, order, cds, settings.furniture, (c) => plan.placement.get(c.id)?.themeId)
}

/**
 * « C'est rangé » : enregistre la place du nouveau CD. Les CD situés à sa droite dans la même rangée
 * glissent d'une place ; rien d'autre ne bouge.
 */
export async function placeCd(cd: Cd, ins: Insertion, plan: Plan): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.cds, async () => {
    const neighbours = await db.cds.filter((c) => c.location?.slotId === ins.slot.id).toArray()
    for (const c of neighbours) {
      if (c.id !== cd.id && c.location!.position >= ins.position) {
        await db.cds.update(c.id, { location: { ...c.location!, position: c.location!.position + 1 }, updatedAt: now })
      }
    }
    await db.cds.update(cd.id, {
      location: { furnitureId: ins.slot.furnitureId, slotId: ins.slot.id, position: ins.position },
      themeId: plan.placement.get(cd.id)?.themeId,
      updatedAt: now,
    })
  })
}

/** Emplacement lisible d'un CD, ex. « Billy · niveau 3 · derrière · 12e CD en partant de la gauche ». */
export function locationLabel(cd: Cd): string | null {
  const loc = cd.location
  if (!loc) return null
  const f = settings.furniture.find((x) => x.id === loc.furnitureId)
  if (!f) return null
  const [, rest] = loc.slotId.split(':')
  const [level, column, layer, depthRow] = rest.split('-').map(Number)
  const parts = [f.name, `niveau ${level}`]
  if (f.columns > 1) parts.push(`case ${column}`)
  if (f.layers > 1) parts.push(layer === 1 ? 'couche du haut' : 'couche du bas')
  if (f.depthRows > 1) parts.push(depthRow === 1 ? 'devant' : 'derrière')
  parts.push(`${loc.position}${loc.position === 1 ? 'er' : 'e'} CD en partant de la gauche`)
  return parts.join(' · ')
}
