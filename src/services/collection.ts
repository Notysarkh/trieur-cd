import { db, newId } from '../db/database'
import type { Cd, CdDraft } from '../db/types'
import { canonicalBarcode } from '../lib/barcode'
import { guessSortName } from '../lib/sortName'

// Opérations sur la collection de CD.

/**
 * Ajoute un CD et renvoie son identifiant.
 * `id` : à fournir seulement pour recréer un CD venu d'un autre appareil (import), afin de ne pas le dupliquer.
 */
export async function addCd(draft: CdDraft, id?: string): Promise<string> {
  const now = Date.now()
  const cd: Cd = {
    ...JSON.parse(JSON.stringify(draft)),
    barcode: draft.barcode ? canonicalBarcode(draft.barcode) : undefined,
    artistSort: draft.artistSort.trim() || guessSortName(draft.artist),
    id: id || newId(),
    createdAt: now,
    updatedAt: now,
  }
  await db.cds.add(cd)
  return cd.id
}

/** Enregistre les modifications d'un CD. */
export async function updateCd(id: string, changes: Partial<Cd>): Promise<void> {
  const clean = JSON.parse(JSON.stringify(changes)) as Partial<Cd>
  if (clean.barcode) clean.barcode = canonicalBarcode(clean.barcode)
  await db.cds.update(id, { ...clean, updatedAt: Date.now() })
}

export async function deleteCd(id: string): Promise<void> {
  await db.cds.delete(id)
}

/** CD de la collection ayant ce code-barres (pour détecter les doublons). */
export function findByBarcode(barcode: string): Promise<Cd[]> {
  return db.cds.where('barcode').equals(canonicalBarcode(barcode)).toArray()
}
