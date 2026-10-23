import { db } from '../db/database'
import type { Cd } from '../db/types'
import { canonicalBarcode } from '../lib/barcode'
import { findByBarcode } from './collection'

// Mode « rangement » du scanner : on rescanne chaque CD de la pile, l'appli dit où le poser
// et le compte comme rangé. Pratique après un scan d'inventaire de toute la collection.

export interface ShelvingResult {
  code: string
  /** Les CD de la collection qui portent ce code (souvent 1 ; 2 s'il y a un doublon). */
  cds: Cd[]
  /** Le CD compté comme rangé par ce scan (le premier exemplaire pas encore rangé). */
  shelved?: Cd
}

/** Cherche le CD scanné et le compte comme rangé s'il a un emplacement. */
export async function shelveByBarcode(raw: string): Promise<ShelvingResult> {
  const code = canonicalBarcode(raw)
  const cds = (await findByBarcode(code)).sort((a, b) => (a.location?.slotId ?? '').localeCompare(b.location?.slotId ?? ''))
  // S'il y a plusieurs exemplaires, on range d'abord celui qui ne l'est pas encore.
  const target = cds.find((c) => c.location && !c.shelvedAt) ?? cds.find((c) => c.location)
  if (target && !target.shelvedAt) {
    await setShelved(target.id, true)
    target.shelvedAt = Date.now()
  }
  return { code, cds, shelved: target }
}

/** Marque (ou démarque) un CD comme posé à sa place. */
export async function setShelved(id: string, shelved: boolean): Promise<void> {
  await db.cds.update(id, { shelvedAt: shelved ? Date.now() : undefined, updatedAt: Date.now() })
}

/** Remet le compteur « rangés » à zéro (pour recommencer un rangement). */
export async function resetShelved(): Promise<void> {
  const ids = await db.cds.filter((c) => !!c.shelvedAt).primaryKeys()
  await db.cds.bulkUpdate(ids.map((key) => ({ key, changes: { shelvedAt: undefined } })))
}

/** Les CD de la même rangée, de gauche à droite. */
export function rowOf(cd: Cd, all: Cd[]): Cd[] {
  const slotId = cd.location?.slotId
  if (!slotId) return []
  return all.filter((c) => c.location?.slotId === slotId).sort((a, b) => a.location!.position - b.location!.position)
}
