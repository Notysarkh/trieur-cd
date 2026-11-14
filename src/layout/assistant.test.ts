import { describe, expect, it } from 'vitest'
import type { Cd } from '../db/types'
import { whereToShelve } from './assistant'
import type { Furniture } from './furniture'

// Tests de la fiche « Où le ranger ».

const shelf: Furniture = {
  id: 'e',
  name: 'Étagère',
  model: 'test',
  levels: 2,
  columns: 1,
  innerWidthCm: 40,
  innerHeightCm: 30,
  depthCm: 25,
  depthRows: 1,
  layers: 1,
  reserved: [],
}

/** Une rangée de CD numérotés A, B, C… ; `shelved` = lettres déjà posées. */
function row(level: number, letters: string, shelved = ''): Cd[] {
  return [...letters].map((l, i) => ({
    id: l,
    artist: l,
    artistSort: l,
    title: `Album ${l}`,
    genres: [],
    styles: [],
    format: 'standard',
    discCount: 1,
    thicknessMm: 10,
    coverUrls: [],
    isCompilation: false,
    status: 'identifie',
    confidence: 90,
    confidenceReasons: [],
    source: 'manuel',
    createdAt: 0,
    updatedAt: 0,
    location: { furnitureId: 'e', slotId: `e:${level}-1-1-1`, position: i + 1 },
    shelvedAt: shelved.includes(l) ? 1 : undefined,
  }))
}
const find = (all: Cd[], id: string) => all.find((c) => c.id === id)!

describe('fiche « Où le ranger »', () => {
  it('donne l’emplacement et la liste théorique (2 avant, 2 après)', () => {
    const all = row(1, 'ABCDEFG')
    const w = whereToShelve(find(all, 'D'), all, [shelf])!
    expect(w.slot.level).toBe(1)
    expect(w.position).toBe(4)
    expect(w.theoretical.map((l) => l.cd.id)).toEqual(['B', 'C', 'D', 'E', 'F'])
    expect(w.theoretical.find((l) => l.isTarget)?.cd.id).toBe('D')
  })

  it('« identique au plan » quand les voisins directs sont déjà posés', () => {
    const all = row(1, 'ABCDE', 'ACE')
    const w = whereToShelve(find(all, 'B'), all, [shelf])!
    expect(w.real.before?.id).toBe('A')
    expect(w.real.after?.id).toBe('C')
    expect(w.real.sameAsPlan).toBe(true)
  })

  it('signale les CD encore à venir et la place à laisser', () => {
    const all = row(1, 'ABCDEFG', 'AG')
    const w = whereToShelve(find(all, 'D'), all, [shelf])!
    expect(w.real.before?.id).toBe('A')
    expect(w.real.after?.id).toBe('G')
    expect(w.real.sameAsPlan).toBe(false)
    expect(w.real.gapBefore).toEqual({ count: 2, mm: 20 }) // B et C
    expect(w.real.gapAfter).toEqual({ count: 2, mm: 20 }) // E et F
  })

  it('début de rangée : pas de voisin à gauche, voisin le plus proche dans la rangée précédente', () => {
    const all = [...row(1, 'AB', 'A'), ...row(2, 'CDE', 'E')]
    const w = whereToShelve(find(all, 'C'), all, [shelf])!
    expect(w.real.before).toBeUndefined()
    expect(w.real.nearestBefore?.cd.id).toBe('A')
    expect(w.real.after?.id).toBe('E')
    expect(w.real.gapAfter.count).toBe(1) // D
    // La liste théorique traverse la limite de rangée et l'indique.
    expect(w.theoretical.find((l) => l.cd.id === 'B')?.otherSlot).toContain('niveau 1')
  })

  it('rangée vide : premier CD, à gauche / au centre / à droite selon sa place', () => {
    const all = row(1, 'ABCDEFGHI')
    expect(whereToShelve(find(all, 'A'), all, [shelf])!.real).toMatchObject({ emptyRow: true, hint: 'à gauche' })
    expect(whereToShelve(find(all, 'E'), all, [shelf])!.real.hint).toBe('au centre')
    expect(whereToShelve(find(all, 'I'), all, [shelf])!.real.hint).toBe('à droite')
  })

  it('compte la progression totale, par meuble et par rangée', () => {
    const all = [...row(1, 'ABC', 'AB'), ...row(2, 'DE', 'D')]
    const w = whereToShelve(find(all, 'E'), all, [shelf])!
    expect(w.progress.total).toEqual({ done: 3, all: 5 })
    expect(w.progress.furniture).toEqual({ done: 3, all: 5 })
    expect(w.progress.row).toEqual({ done: 1, all: 2 })
  })

  it('fonctionne pour un CD ajouté après le rangement (place proposée)', () => {
    const all = row(1, 'ABD', 'ABD')
    const neu: Cd = { ...all[0], id: 'C', artist: 'C', location: undefined, shelvedAt: undefined }
    const slot = { id: 'e:1-1-1-1', furnitureId: 'e', furnitureName: 'Étagère', level: 1, column: 1, layer: 1, depthRow: 1, capacityMm: 400, label: 'Étagère · niveau 1' }
    const w = whereToShelve(neu, [...all, neu], [shelf], 2, { slot, position: 3, after: all[1], before: all[2], fits: true, freeMm: 370 })!
    expect(w.located).toBe(false)
    expect(w.real.before?.id).toBe('B')
    expect(w.real.after?.id).toBe('D')
    expect(w.real.sameAsPlan).toBe(true)
  })
})
