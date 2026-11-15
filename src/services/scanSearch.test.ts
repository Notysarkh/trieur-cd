import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../db/database'
import type { ScanItem } from '../db/types'
import { gameDraftFromRawg } from './games'
import { finalDraft, isReady, useSearchResult } from './scanQueue'

// Code introuvable : recherche par titre directement dans la file du scanner.

describe('recherche par titre dans la file', () => {
  it('le jeu choisi garde le code-barres scanné et prend la console de la recherche', async () => {
    const item: ScanItem = {
      id: 's1', barcode: '5055060923825', media: 'jeu', scannedAt: 0, state: 'introuvable', candidates: [],
      chosenByUser: false, duplicateOfIds: [], include: true, attempts: 0,
    }
    await db.scans.add(item)
    // Résultat RAWG d'un jeu sorti sur plusieurs consoles : la console vient de la recherche.
    const draft = gameDraftFromRawg({ id: 3, title: 'Okami', year: 2006, genres: ['Action'], platforms: ['ps2', 'ps3'] })
    await useSearchResult('s1', { key: 'rawg:3', draft, enriched: true }, 'ps2')

    const after = (await db.scans.get('s1'))!
    expect(after.state).toBe('trouve')
    expect(isReady(after)).toBe(true)
    const d = finalDraft(after)!
    expect(d).toMatchObject({ title: 'Okami', barcode: '5055060923825', platform: 'ps2', heightCm: 19, confidence: 85, status: 'identifie' })
    expect(d.confidenceReasons[0]).toMatch(/recherche par titre/)
  })
})
