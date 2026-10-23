import { describe, expect, it } from 'vitest'
import { buildPlan } from '../classification/engine'
import { defaultRules, type ClassificationRules } from '../classification/themes'
import type { Cd } from '../db/types'
import { buildSlots, defaultFurniture, furnitureCapacity, furnitureWarnings, type Furniture } from './furniture'
import { packLayout } from './packer'

// Tests de la répartition dans les meubles.

let n = 0
function cd(artist: string, extra: Partial<Cd> = {}): Cd {
  n++
  return {
    id: `cd${n}`,
    artist,
    artistSort: artist,
    title: `Album ${n}`,
    year: 1970 + (n % 50),
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

/** Une étagère de test : `levels` rangées de `widthCm` cm. */
function shelf(levels: number, widthCm: number, extra: Partial<Furniture> = {}): Furniture {
  return {
    id: 'etagere',
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
    ...extra,
  }
}

describe('meubles', () => {
  it('calcule la capacité de ton meuble CD', () => {
    const [meubleCd, billy] = defaultFurniture()
    const cap = furnitureCapacity(meubleCd)
    expect(cap.perRow).toBe(39) // 410 mm / 10,4 mm (tu en comptes 38 : marge de manœuvre)
    expect(cap.standardCds).toBe(11 * 39)
    expect(buildSlots([billy])).toHaveLength(12) // 6 tablettes × 2 rangées
  })

  it('ordonne les rangées : haut → bas, gauche → droite, devant → derrière', () => {
    const slots = buildSlots([shelf(2, 30, { columns: 2, depthRows: 2 })])
    expect(slots.map((s) => `${s.level}${s.column}${s.depthRow}`)).toEqual([
      '111', '112', '121', '122', '211', '212', '221', '222',
    ])
  })

  it('ignore les cases réservées', () => {
    expect(buildSlots([shelf(3, 30, { reserved: ['2-1'] })]).map((s) => s.level)).toEqual([1, 3])
  })

  it('signale une double rangée trop profonde', () => {
    const [, billy] = defaultFurniture()
    expect(furnitureWarnings(billy).join(' ')).toContain('dépasseront')
  })
})

describe('répartition', () => {
  it('respecte la marge de croissance dans chaque rangée', () => {
    const cds = Array.from({ length: 20 }, (_, i) => cd(`Artiste ${String(i).padStart(2, '0')}`))
    const layout = packLayout(buildPlan(cds, rules()), [shelf(5, 10)], { marginPct: 25, themeStartsNewSlot: false })
    // 100 mm / 1,25 = 80 mm → 8 CD de 10 mm par rangée
    expect(layout.slots.map((s) => s.cds.length)).toEqual([8, 8, 4, 0, 0])
    expect(layout.overflow).toHaveLength(0)
  })

  it("ne coupe pas un artiste quand on peut l'éviter", () => {
    const cds = [
      ...Array.from({ length: 7 }, () => cd('A')),
      ...Array.from({ length: 3 }, () => cd('B')),
    ]
    // rangées de 100 mm, sans marge : A (70 mm) + B (30 mm) = 100 → tout tient
    // avec 10 % de marge : 90 mm utiles → B ne tient plus en entier, il passe dans la rangée suivante
    const layout = packLayout(buildPlan(cds, rules()), [shelf(2, 10)], { marginPct: 10, themeStartsNewSlot: false })
    expect(layout.slots[0].cds.every((c) => c.artist === 'A')).toBe(true)
    expect(layout.slots[1].cds.every((c) => c.artist === 'B')).toBe(true)
    expect(layout.cuts).toHaveLength(0)
  })

  it('coupe un artiste trop grand pour une seule rangée, et le signale', () => {
    const cds = Array.from({ length: 15 }, () => cd('Énorme'))
    const layout = packLayout(buildPlan(cds, rules()), [shelf(2, 10)], { marginPct: 0, themeStartsNewSlot: false })
    expect(layout.slots.map((s) => s.cds.length)).toEqual([10, 5])
    expect(layout.cuts.map((c) => c.label)).toEqual(['Énorme'])
  })

  it('garde les thèmes dans l’ordre et contigus', () => {
    const cds = [cd('Jazzman', { styles: ['Bebop'] }), cd('Rockeur'), cd('Rockeur 2')]
    const layout = packLayout(buildPlan(cds, rules()), [shelf(3, 10)], { marginPct: 0, themeStartsNewSlot: false })
    expect(layout.slots[0].themes.map((t) => t.theme.id)).toEqual(['rock', 'jazz'])
    expect(layout.slots[0].first).toBe('Rockeur')
    expect(layout.slots[0].last).toBe('Jazzman')
  })

  it('peut commencer chaque thème dans une nouvelle rangée', () => {
    const cds = [cd('Jazzman', { styles: ['Bebop'] }), cd('Rockeur')]
    const layout = packLayout(buildPlan(cds, rules()), [shelf(3, 10)], { marginPct: 0, themeStartsNewSlot: true })
    expect(layout.slots.map((s) => s.themes.map((t) => t.theme.id).join())).toEqual(['rock', 'jazz', ''])
  })

  it('signale la surcharge et propose une marge qui fonctionne', () => {
    const cds = Array.from({ length: 19 }, (_, i) => cd(`Artiste ${String(i).padStart(2, '0')}`))
    const layout = packLayout(buildPlan(cds, rules()), [shelf(2, 10)], { marginPct: 15, themeStartsNewSlot: false })
    expect(layout.overflow.length).toBeGreaterThan(0)
    expect(layout.suggestions.join(' ')).toMatch(/marge de croissance de \d+ %/)
  })

  it('donne la position de chaque CD', () => {
    const cds = [cd('A'), cd('B')]
    const layout = packLayout(buildPlan(cds, rules()), [shelf(1, 10)], { marginPct: 0, themeStartsNewSlot: false })
    expect(layout.placement.get(cds[1].id)).toEqual({ furnitureId: 'etagere', slotId: 'etagere:1-1-1-1', position: 2 })
  })

  it('range 750 CD dans tes meubles en bien moins d’une seconde', () => {
    const styles = ['Grunge', 'Bebop', 'House', 'Soul', 'Synth Pop', 'Heavy Metal', 'Reggae', 'Folk']
    const big = Array.from({ length: 750 }, (_, i) =>
      cd(`Artiste ${i % 300}`, { styles: [styles[i % styles.length]], thicknessMm: [10.4, 10.4, 10.4, 5.2, 7][i % 5] }),
    )
    const layout = packLayout(buildPlan(big, defaultRules()), defaultFurniture(), {
      marginPct: 15,
      themeStartsNewSlot: false,
    })
    expect(layout.placement.size + layout.overflow.length).toBe(750)
    expect(layout.durationMs).toBeLessThan(1000)
  })
})
