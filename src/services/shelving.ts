import { db } from '../db/database'
import type { Cd } from '../db/types'
import { canonicalBarcode } from '../lib/barcode'
import { findByBarcode } from './collection'

// Mode « rangement » du scanner : on rescanne chaque CD de la pile, l'appli ouvre sa fiche
// « Où le ranger », et tu confirmes avec « Rangé ✓ ».

export interface ShelvingLookup {
  code: string
  /** Les CD de la collection qui portent ce code (souvent 1 ; 2 s'il y a un doublon). */
  cds: Cd[]
  /** Le CD à ranger : le premier exemplaire pas encore rangé. */
  target?: Cd
}

/** Cherche le CD scanné (sans rien modifier). */
export async function lookupForShelving(raw: string): Promise<ShelvingLookup> {
  const code = canonicalBarcode(raw)
  const cds = await findByBarcode(code)
  // S'il y a plusieurs exemplaires, on propose d'abord celui qui n'est pas encore rangé.
  const target = cds.find((c) => !c.shelvedAt) ?? cds[0]
  return { code, cds, target }
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
