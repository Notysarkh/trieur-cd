import { describe, expect, it } from 'vitest'
import { buildPlan } from '../classification/engine'
import { defaultGameRules, defaultRules } from '../classification/themes'
import type { Cd } from '../db/types'
import { addV2Furniture, buildSlots, defaultFurniture, furnitureFor, furnitureWarnings } from './furniture'
import { packLayout } from './packer'

// v2, étape E : meubles partagés entre univers.

let n = 0
function item(extra: Partial<Cd> = {}): Cd {
  n++
  return {
    id: `x${n}`, artist: `Artiste ${n % 40}`, artistSort: `Artiste ${n % 40}`, title: `Titre ${n}`, year: 1970 + (n % 50),
    genres: [], styles: [['Grunge', 'Jazz', 'House', 'Hip Hop'][n % 4]], format: 'standard', discCount: 1, thicknessMm: 10.4,
    coverUrls: [], isCompilation: false, status: 'identifie', confidence: 90, confidenceReasons: [], source: 'manuel',
    createdAt: 0, updatedAt: 0, ...extra,
  }
}

/** Tes meubles avant l'étape E : meuble CD + Billy en double rangée, niveaux 1, 3, 5 et 6 réservés. */
function myFurniture() {
  const [cd, billy] = defaultFurniture()
  return [cd, { ...billy, reserved: ['1-1', '3-1', '5-1', '6-1'] }]
}

describe('meubles de la v2', () => {
  it('ajoute les meubles des livres et des jeux, une seule fois, avec des identifiants fixes', () => {
    const once = addV2Furniture(myFurniture())
    expect(once.map((f) => f.id)).toEqual(['meuble-cd', 'billy', 'billy-livres-1', 'billy-livres-2', 'billy-livres-demie', 'rangement-jeux'])
    expect(addV2Furniture(once)).toEqual(once)
    expect(once.find((f) => f.id === 'billy-livres-demie')!.innerWidthCm).toBe(36)
    expect(once.find((f) => f.id === 'rangement-jeux')).toMatchObject({ media: 'jeu', levels: 11, innerHeightCm: 13.5 })
  })

  it('Billy niveau 1 : passe aux films seulement s’il était réservé', () => {
    const billy = addV2Furniture(myFurniture()).find((f) => f.id === 'billy')!
    expect(billy.reserved).toEqual(['3-1', '5-1', '6-1'])
    expect(billy.caseMedia).toEqual({ '1-1': 'video' })
    const free = addV2Furniture(defaultFurniture()).find((f) => f.id === 'billy')!
    expect(free.caseMedia).toBeUndefined()
    expect(free.reserved).toEqual([])
  })

  it('chaque univers ne voit que ses cases, dans l’ordre de remplissage', () => {
    const all = addV2Furniture(myFurniture())
    expect(buildSlots(furnitureFor(all, 'video')).map((s) => s.label)).toEqual(['Billy · niveau 1 · devant', 'Billy · niveau 1 · derrière'])
    expect(furnitureFor(all, 'livre').map((f) => f.id)).toEqual(['billy-livres-1', 'billy-livres-2', 'billy-livres-demie'])
    expect(furnitureFor(all, 'jeu').map((f) => f.id)).toEqual(['rangement-jeux'])
  })

  it('tes CD gardent exactement leurs places', () => {
    const cds = Array.from({ length: 600 }, () => item())
    const plan = buildPlan(cds, { ...defaultRules(), minCdsPerTheme: 0 })
    const options = { marginPct: 15, themeStartsNewSlot: false }
    const before = packLayout(plan, myFurniture(), options)
    const after = packLayout(plan, furnitureFor(addV2Furniture(myFurniture()), 'cd'), options)
    expect([...after.placement]).toEqual([...before.placement])
    expect(after.overflow.length).toBe(before.overflow.length)
  })

  it('signale les jeux trop hauts pour leur étagère', () => {
    const games = [item({ media: 'jeu', platform: 'ps2', heightCm: 19 }), item({ media: 'jeu', platform: 'ps1', heightCm: 13 })]
    const plan = buildPlan(games, defaultGameRules())
    const layout = packLayout(plan, furnitureFor(addV2Furniture(myFurniture()), 'jeu'), { marginPct: 15, themeStartsNewSlot: false }, 'jeu')
    expect(layout.tooTall.map((t) => t.cd.platform)).toEqual(['ps2'])
    expect(layout.suggestions.join(' ')).toMatch(/1 jeu trop haut/)
  })

  it('tiroirs où les jeux sont couchés, tranche vers le haut : c’est la largeur qui compte', () => {
    // Ton meuble « Tiroirs jeux » : 3 tiroirs de 41 × 15 cm, 32 cm de profondeur, 2 rangées.
    const drawers = { ...addV2Furniture(myFurniture()).find((f) => f.id === 'rangement-jeux')!, name: 'Tiroirs jeux', levels: 3, innerWidthCm: 41, innerHeightCm: 15, depthCm: 32, depthRows: 2 as const }
    const games = [
      item({ media: 'jeu', platform: 'ps2', heightCm: 19 }),
      item({ media: 'jeu', platform: 'switch', heightCm: 17 }),
      item({ media: 'jeu', platform: 'ps1', heightCm: 13 }),
    ]
    const plan = buildPlan(games, defaultGameRules())
    const options = { marginPct: 15, themeStartsNewSlot: false }
    const standing = packLayout(plan, furnitureFor([drawers], 'jeu'), options, 'jeu')
    expect(standing.tooTall.map((t) => t.cd.platform)).toEqual(['ps2', 'switch'])
    expect(standing.suggestions.join(' ')).toMatch(/2 d'entre eux tiendraient couchés/)
    // Même meuble, réglé « couchés » : la PS2 (13,5 cm de large) et la Switch (10,5) tiennent dans 15 cm.
    const lying = packLayout(plan, furnitureFor([{ ...drawers, orientation: 'couche' }], 'jeu'), options, 'jeu')
    expect(lying.tooTall).toEqual([])
    // La place dans les rangées ne change pas.
    expect([...lying.placement]).toEqual([...standing.placement])
    // Tiroir trop bas, même couché : la largeur est signalée.
    const low = packLayout(plan, furnitureFor([{ ...drawers, orientation: 'couche', innerHeightCm: 12 }], 'jeu'), options, 'jeu')
    expect(low.tooTall.map((t) => [t.cd.platform, t.heightCm, t.lying])).toEqual([['ps1', 14.2, true], ['ps2', 13.5, true], ['switch', 10.5, true]].filter((x) => (x[1] as number) > 12))
  })

  it('meuble CD couché : les alertes tiennent compte de la largeur du boîtier', () => {
    const [cd] = defaultFurniture()
    expect(furnitureWarnings({ ...cd, innerHeightCm: 13.5 })).toEqual([])
    expect(furnitureWarnings({ ...cd, innerHeightCm: 13.5, orientation: 'couche' }).join(' ')).toMatch(/couché \(14,2 cm de large\)/)
  })

  it('pas d’alerte « boîtier CD » sur un meuble à livres', () => {
    const books = addV2Furniture(myFurniture()).find((f) => f.id === 'billy-livres-1')!
    expect(furnitureWarnings(books)).toEqual([])
  })
})
