import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../db/database'
import type { Cd } from '../db/types'
import { buildCsv, importCsv } from './csvExport'

// L'export CSV contient tous les univers, et l'import les remet dans le bon univers.

const base = (extra: Partial<Cd>): Cd =>
  ({
    artist: 'X', artistSort: 'X', title: 'T', genres: [], styles: [], format: 'standard', discCount: 1, thicknessMm: 10.4,
    coverUrls: [], isCompilation: false, status: 'identifie', confidence: 90, confidenceReasons: [], source: 'manuel',
    createdAt: 0, updatedAt: 0, ...extra,
  }) as Cd

describe('CSV de tous les univers', () => {
  it('exporte puis réimporte un CD, un livre et un jeu', async () => {
    await db.cds.bulkAdd([
      base({ id: 'c1', artist: 'Daft Punk', title: 'Discovery' }),
      base({ id: 'l1', media: 'livre', artist: 'Goscinny', title: 'Astérix le Gaulois', bookKind: 'bd', series: 'Astérix', volume: 1, format: 'autre' }),
      base({ id: 'j1', media: 'jeu', artist: 'Sony', title: 'Gran Turismo 4', platform: 'ps2', heightCm: 19, format: 'autre', barcode: '0711719630523' }),
    ])
    const csv = await (await buildCsv()).text()
    expect(csv).toMatch(/Univers/)
    expect(csv).toMatch(/Jeux vidéo;Sony;X;Gran Turismo 4/)
    expect(csv).toMatch(/PlayStation 2/)

    await db.cds.clear()
    const report = await importCsv(new File([csv], 'export.csv'))
    expect(report.added).toBe(3)
    expect(await db.cds.get('c1')).toMatchObject({ title: 'Discovery' })
    expect((await db.cds.get('c1'))?.media).toBeUndefined()
    expect(await db.cds.get('l1')).toMatchObject({ media: 'livre', bookKind: 'bd', series: 'Astérix', volume: 1 })
    expect(await db.cds.get('j1')).toMatchObject({ media: 'jeu', platform: 'ps2', heightCm: 19, barcode: '0711719630523' })

    // Réimporter le même fichier ne change rien.
    const again = await importCsv(new File([csv], 'export.csv'))
    expect(again.unchanged).toBe(3)
  })
})
