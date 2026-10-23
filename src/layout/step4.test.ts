import { describe, expect, it } from 'vitest'
import { buildPlan } from '../classification/engine'
import { defaultRules, type ClassificationRules, type ThemeDef } from '../classification/themes'
import type { Cd } from '../db/types'
import { parseCsv, toCsv } from '../lib/csv'
import type { Furniture } from './furniture'
import { suggestInsertion } from './insertion'
import { buildLabels, sortLetter } from './labels'
import { packLayout } from './packer'

// Tests de l'étape 4 : insertion d'un nouveau CD, étiquettes, CSV.

let n = 0
function cd(artist: string, extra: Partial<Cd> = {}): Cd {
  n++
  return {
    id: `cd${n}`,
    artist,
    artistSort: artist,
    title: `Album ${n}`,
    year: 1990,
    genres: [],
    styles: ['Grunge'],
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
    ...extra,
  }
}
const rules = (): ClassificationRules => ({ ...defaultRules(), minCdsPerTheme: 0, maxThemes: 99 })
const shelf = (levels: number, widthCm: number): Furniture => ({
  id: 'e',
  name: 'Étagère',
  model: 'test',
  levels,
  columns: 1,
  innerWidthCm: widthCm,
  innerHeightCm: 30,
  depthCm: 25,
  depthRows: 1,
  layers: 1,
  reserved: [],
})

/** Applique une répartition « pour de faux » : chaque CD reçoit son emplacement. */
function applied(cds: Cd[], furniture: Furniture[], marginPct = 25): Cd[] {
  const plan = buildPlan(cds, rules())
  const layout = packLayout(plan, furniture, { marginPct, themeStartsNewSlot: false })
  return cds.map((c) => ({ ...c, location: layout.placement.get(c.id), themeId: plan.placement.get(c.id)?.themeId }))
}

describe('insertion d’un nouveau CD', () => {
  it('le place juste après son voisin, sans toucher aux autres rangées', () => {
    const placed = applied([cd('Abba'), cd('Blur'), cd('Cure'), cd('Doors'), cd('Eels')], [shelf(3, 4)])
    // 40 mm à 25 % de marge → 32 mm utiles → 3 CD par rangée : Abba Blur Cure | Doors Eels
    const neu = cd('Beck')
    const all = [...placed, neu]
    const plan = buildPlan(all, rules())
    const order = plan.themes.flatMap((t) => t.cds)
    const ins = suggestInsertion(neu, order, placed, [shelf(3, 4)], (c) => plan.placement.get(c.id)?.themeId)!
    expect(ins.slot.level).toBe(1)
    expect(ins.position).toBe(2)
    expect(ins.after?.artist).toBe('Abba')
    expect(ins.before?.artist).toBe('Blur')
    expect(ins.fits).toBe(true) // 30 mm occupés sur 40
  })

  it('signale une rangée pleine', () => {
    const placed = applied([cd('Abba'), cd('Blur'), cd('Cure'), cd('Doors')], [shelf(2, 3)], 0)
    const neu = cd('Beck')
    const plan = buildPlan([...placed, neu], rules())
    const ins = suggestInsertion(neu, plan.themes.flatMap((t) => t.cds), placed, [shelf(2, 3)], (c) => plan.placement.get(c.id)?.themeId)!
    expect(ins.fits).toBe(false)
  })

  it('renvoie null tant que rien n’est rangé', () => {
    const a = cd('Abba')
    expect(suggestInsertion(a, [a], [], [shelf(1, 10)], () => 'rock')).toBeNull()
  })
})

describe('étiquettes', () => {
  const rock: ThemeDef = defaultRules().themes.find((t) => t.id === 'rock')!
  it('calcule l’initiale de tri', () => {
    expect(sortLetter(cd('Beatles', { artistSort: 'Beatles, The' }), rock)).toBe('B')
    expect(sortLetter(cd('Étienne Daho', { artistSort: 'Daho, Étienne' }), rock)).toBe('D')
    expect(sortLetter(cd('Écho', { artistSort: 'Écho' }), rock)).toBe('E')
    expect(sortLetter(cd('10cc', { artistSort: '10cc' }), rock)).toBe('#')
  })

  it('produit « Rock — A à C » puis « Rock — D à E » par rangée', () => {
    const placed = applied([cd('Abba'), cd('Blur'), cd('Cure'), cd('Doors'), cd('Eels')], [shelf(3, 4)])
    const labels = buildLabels(placed, [shelf(3, 4)], () => rock, 'rangee')
    expect(labels.map((l) => `${l.theme.name} — ${l.range}`)).toEqual(['Rock — A à C', 'Rock — D à E'])
    expect(buildLabels(placed, [shelf(3, 4)], () => rock, 'theme').map((l) => l.range)).toEqual(['A à E'])
    expect(buildLabels(placed, [shelf(3, 4)], () => rock, 'lettre')).toHaveLength(5)
  })
})

describe('CSV', () => {
  it('écrit et relit les guillemets, points-virgules et retours à la ligne', () => {
    const rows = [['Artiste', 'Titre'], ['Simon & Garfunkel', 'Bridge; "over"\nTroubled']]
    expect(parseCsv('﻿' + toCsv(rows))).toEqual(rows)
  })
  it('lit un CSV à virgules (export Google Sheets)', () => {
    expect(parseCsv('Artiste,Titre\r\nAir,Moon Safari\r\n')).toEqual([['Artiste', 'Titre'], ['Air', 'Moon Safari']])
  })
})
