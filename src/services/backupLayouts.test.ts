import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { addV2Furniture, defaultFurniture } from '../layout/furniture'
import { buildBackup, importBackup } from './backup'
import { saveSetting, settings } from './settings'
import { computeLayout } from './layout'
import { buildPlan } from '../classification/engine'
import { defaultRules } from '../classification/themes'
import type { Cd } from '../db/types'

// v2, étape E : la sauvegarde garde les rangements de chaque univers et les meubles partagés.

describe('sauvegarde des rangements par univers', () => {
  it('un appareil neuf reprend les rangements des livres, films et jeux du fichier', async () => {
    const furniture = addV2Furniture(defaultFurniture())
    furniture[1] = { ...furniture[1], caseMedia: { '1-1': 'video' } }
    await saveSetting('furniture', furniture)
    await saveSetting('videoLayoutAppliedAt', 111)
    await saveSetting('gameLayoutAppliedAt', 222)
    const file = await buildBackup()

    // Autre appareil : rien d'appliqué, meubles par défaut.
    await saveSetting('videoLayoutAppliedAt', 0)
    await saveSetting('gameLayoutAppliedAt', 0)
    await saveSetting('furniture', addV2Furniture(defaultFurniture()))
    const report = await importBackup(file)

    expect(report.layoutAdopted).toBe(true)
    expect(settings.videoLayoutAppliedAt).toBe(111)
    expect(settings.gameLayoutAppliedAt).toBe(222)
    expect(settings.furniture.find((f) => f.id === 'billy')?.caseMedia).toEqual({ '1-1': 'video' })
  })

  it('changer la marge des jeux ne touche pas au plan des CD', async () => {
    const cds = Array.from({ length: 200 }, (_, i) => ({
      id: `c${i}`, artist: `Artiste ${i % 30}`, artistSort: `Artiste ${i % 30}`, title: `Album ${i}`, genres: [], styles: ['Rock'],
      format: 'standard', discCount: 1, thicknessMm: 10.4, coverUrls: [], isCompilation: false, status: 'identifie', confidence: 90,
      confidenceReasons: [], source: 'manuel', createdAt: 0, updatedAt: 0,
    })) as Cd[]
    const plan = buildPlan(cds, defaultRules())
    const before = computeLayout(plan, 'cd').placement
    await saveSetting('gameLayout', { marginPct: 80, themeStartsNewSlot: true })
    expect([...computeLayout(plan, 'cd').placement]).toEqual([...before])
    expect(settings.layout.marginPct).toBe(15)
  })

  it('une sauvegarde d’avant l’étape E reçoit les meubles des livres et des jeux', async () => {
    await saveSetting('videoLayoutAppliedAt', 0)
    const old = {
      format: 'trieur-cd',
      version: 1,
      cds: [],
      furniture: defaultFurniture(),
      layoutAppliedAt: 5,
    }
    await saveSetting('layoutAppliedAt', 0)
    await importBackup(new File([JSON.stringify(old)], 'ancien.json'))
    expect(settings.furniture.map((f) => f.id)).toEqual([
      'meuble-cd', 'billy', 'billy-livres-1', 'billy-livres-2', 'billy-livres-demie', 'rangement-jeux',
    ])
  })
})
