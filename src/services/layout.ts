import { groupKeyOf, type Plan } from '../classification/engine'
import { db } from '../db/database'
import type { Cd } from '../db/types'
import { buildSlots } from '../layout/furniture'
import { suggestInsertion, type Insertion } from '../layout/insertion'
import { shelvedToKeep } from '../layout/keepShelved'
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
  /** CD DÉJÀ RANGÉS à déplacer physiquement (les autres rangés restent où ils sont). */
  shelvedToMove: number
  /** CD déjà rangés qui restent en place. */
  shelvedKept: number
  total: number
}

/** Ce qui changerait si on appliquait cette répartition, par rapport à celle déjà appliquée. */
export function countMoves(layout: Layout, cds: Cd[]): Moves {
  const m: Moves = { added: 0, otherRow: 0, shifted: 0, removed: 0, shelvedToMove: 0, shelvedKept: 0, total: 0 }
  const keep = shelvedToKeep(cds, layout.placement)
  for (const cd of cds) {
    if (cd.shelvedAt && cd.location) {
      if (keep.has(cd.id)) m.shelvedKept++
      else m.shelvedToMove++
    }
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
 * Un CD déjà rangé GARDE son statut « rangé » s'il reste dans la même rangée et dans le même ordre
 * que ses voisins rangés : il n'a pas à bouger (voir keepShelved.ts).
 */
export async function applyLayout(plan: Plan, layout: Layout): Promise<void> {
  await applyPlan(plan)
  const now = Date.now()
  const cds = await db.cds.toArray()
  const keep = shelvedToKeep(cds, layout.placement)
  const updates = cds.flatMap((cd) => {
    const p = layout.placement.get(cd.id)
    if (p?.slotId === cd.location?.slotId && p?.position === cd.location?.position) return []
    return [{ key: cd.id, changes: { location: p, shelvedAt: keep.has(cd.id) ? cd.shelvedAt : undefined, updatedAt: now } }]
  })
  await db.cds.bulkUpdate(updates)
  await saveSetting('layoutAppliedAt', now)
}

export interface LocationParts {
  furniture: string
  level: number
  column?: number
  layer?: string
  side?: string
  position: number
}

/** Emplacement découpé en morceaux (meuble, niveau, devant/derrière, position). */
export function locationParts(cd: Cd): LocationParts | null {
  const loc = cd.location
  const f = loc && settings.furniture.find((x) => x.id === loc.furnitureId)
  if (!loc || !f) return null
  const [level, column, layer, depthRow] = loc.slotId.split(':')[1].split('-').map(Number)
  return {
    furniture: f.name,
    level,
    column: f.columns > 1 ? column : undefined,
    layer: f.layers > 1 ? (layer === 1 ? 'couche du haut' : 'couche du bas') : undefined,
    side: f.depthRows > 1 ? (depthRow === 1 ? 'devant' : 'derrière') : undefined,
    position: loc.position,
  }
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
      shelvedAt: now,
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

export interface ShelfEntry {
  cd: Cd
  /** Rangée et position (enregistrées, ou proposées pour un CD ajouté après le rangement). */
  slotLabel?: string
  position?: number
  /** Faux si la place est seulement proposée (CD ajouté après le rangement). */
  located: boolean
}

/**
 * Trie des CD dans l'ordre physique du rangement (meuble → rangée → position).
 * Un CD ajouté après le rangement est placé à l'endroit où l'appli propose de le glisser.
 */
export function inShelfOrder(cds: Cd[], all: Cd[], plan: Plan | null): ShelfEntry[] {
  const slots = buildSlots(settings.furniture)
  const index = new Map(slots.map((s, i) => [s.id, i]))
  return cds
    .map((cd) => {
      if (cd.location && index.has(cd.location.slotId)) {
        const i = index.get(cd.location.slotId)!
        return { entry: { cd, slotLabel: slots[i].label, position: cd.location.position, located: true }, key: [i, cd.location.position] }
      }
      const ins = plan && settings.layoutAppliedAt ? insertionFor(cd, plan, all) : null
      if (ins) {
        const i = index.get(ins.slot.id) ?? Infinity
        return { entry: { cd, slotLabel: ins.slot.label, position: ins.position, located: false }, key: [i, ins.position - 0.5] }
      }
      return { entry: { cd, located: false }, key: [Infinity, 0] }
    })
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1])
    .map((x) => x.entry)
}

/**
 * Un CD (ou un artiste) change de thème après le rangement : son emplacement enregistré n'est plus le bon.
 * On l'efface, ainsi que « rangé » : le CD passe « à ranger » et sa fiche propose la nouvelle place
 * (insertion sans rien décaler ailleurs). Pour un artiste, tous ses CD suivent : il n'est jamais coupé en deux thèmes.
 * Renvoie le nombre de CD à replacer.
 */
export async function releasePlacement(cd: Cd, wholeArtist: boolean): Promise<number> {
  const key = groupKeyOf(cd)
  const targets = wholeArtist
    ? await db.cds.filter((c) => groupKeyOf(c) === key && !!c.location).toArray()
    : cd.location
      ? [cd]
      : []
  const now = Date.now()
  await db.cds.bulkUpdate(
    targets.map((c) => ({ key: c.id, changes: { location: undefined, shelvedAt: undefined, themeId: undefined, updatedAt: now } })),
  )
  return targets.length
}
