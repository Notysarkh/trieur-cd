import { describe, expect, it } from 'vitest'
import { buildPlan } from '../classification/engine'
import { defaultGameRules, withNewPlatforms, withPlatforms } from '../classification/themes'
import type { Cd, Platform } from '../db/types'
import { platformFromRawg, platformFromText } from '../lib/platforms'
import { parseSru } from './books'
import { bnfEanVariants, cleanPublisher, gameDraftFromBnf, isGame } from './games'
import { toRawgResult } from './rawg'

// Vraies réponses du catalogue de la BnF (enregistrées le 15/11/2026).
import mk8Deluxe from './fixtures/bnf-jeu-045496420246.xml?raw'
import mk8WiiU from './fixtures/bnf-jeu-45496333133.xml?raw'
import mkDs from './fixtures/bnf-jeu-0045496462321.xml?raw'
import superMarioKart from './fixtures/bnf-jeu-0045496830144.xml?raw'
import chronicles from './fixtures/bnf-jeu-0711719617129.xml?raw'
import tunguska from './fixtures/bnf-jeu-5026555190541.xml?raw'
import simpsonsPsp from './fixtures/bnf-jeu-5030931059438.xml?raw'
import sportsChampions from './fixtures/bnf-jeu-711719155379.xml?raw'
// Pour vérifier qu'un livre ou un DVD n'est pas pris pour un jeu
import amelieDvd from './fixtures/bnf-3384442032803.xml?raw'
import asterix from './fixtures/bnf-9782012101333.xml?raw'

const rec = (xml: string) => parseSru(xml).records[0]
const draftOf = (xml: string, ean?: string, fallback?: Platform) => gameDraftFromBnf(rec(xml), ean, fallback)

describe('jeux : code-barres', () => {
  it('essaie toutes les écritures que la BnF a pu garder', () => {
    // Le scanner lit 13 chiffres ; la BnF a « 045496420246 » (MK8 Deluxe) ou « 45496333133 » (MK8 Wii U).
    expect(bnfEanVariants('0045496420246')).toEqual(expect.arrayContaining(['0045496420246', '045496420246']))
    expect(bnfEanVariants('0045496333133')).toEqual(expect.arrayContaining(['45496333133']))
    expect(bnfEanVariants('5026555190541')).toEqual(['5026555190541'])
  })
})

describe('jeux : notices BnF', () => {
  it('reconnaît la console de chaque jeu', () => {
    expect(draftOf(chronicles).platform).toBe('ps1')
    expect(draftOf(tunguska).platform).toBe('ps2')
    expect(draftOf(sportsChampions).platform).toBe('ps3')
    expect(draftOf(simpsonsPsp).platform).toBe('psp')
    expect(draftOf(mkDs).platform).toBe('nds')
    expect(draftOf(superMarioKart).platform).toBe('snes')
    expect(draftOf(mk8WiiU).platform).toBe('wiiu')
  })

  it('titre avec son complément, éditeur, année, genre', () => {
    const d = draftOf(tunguska, '5026555190541')
    expect(d.media).toBe('jeu')
    expect(d.title).toBe('Tunguska : legend of faith')
    expect(d.artist).toBe('Take 2 interactive')
    expect(d.year).toBe(2000)
    expect(d.confidence).toBe(95)
    expect(d.heightCm).toBe(19)
    expect(draftOf(mkDs).genres).toEqual(["jeu d'arcade ou d'action"])
  })

  it('pré-notice sans console : la console choisie au scan sert, confiance plus basse', () => {
    const sans = draftOf(mk8Deluxe, '0045496420246')
    expect(sans.title).toBe('Mario Kart 8 Deluxe')
    expect(sans.artist).toBe('Nintendo France')
    expect(sans.platform).toBeUndefined()
    expect(sans.confidence).toBe(70)
    const avec = draftOf(mk8Deluxe, '0045496420246', 'switch')
    expect(avec.platform).toBe('switch')
    expect(avec.confidence).toBe(85)
    expect(avec.thicknessMm).toBe(11)
  })

  it('ne prend pas un livre ou un DVD pour un jeu', () => {
    expect(isGame(rec(tunguska))).toBe(true)
    expect(isGame(rec(mk8Deluxe))).toBe(true)
    expect(isGame(rec(amelieDvd))).toBe(false)
    expect(isGame(rec(asterix))).toBe(false)
  })

  it('nettoie le nom de l’éditeur', () => {
    expect(cleanPublisher('[Nintendo co. Ltd]')).toBe('Nintendo co. Ltd')
    expect(cleanPublisher('Nintendo France [diff.]')).toBe('Nintendo France')
    expect(cleanPublisher('NINTENDO FRANCE')).toBe('Nintendo France')
  })
})

describe('jeux : consoles écrites de différentes façons', () => {
  it('lit la console dans la description du support', () => {
    expect(platformFromText('1 disque optique numérique (PlayStation)')).toBe('ps1')
    expect(platformFromText('1 disque optique numérique (Playstation 2)')).toBe('ps2')
    expect(platformFromText('1 disque optique numérique (UMD)')).toBe('psp')
    expect(platformFromText('disque optique numérique (UMD, PlayStation 3)')).toBe('psp')
    expect(platformFromText('1 cartouche Nintento DS')).toBe('nds')
    expect(platformFromText('1 cartouche Nintendo 3DS')).toBe('3ds')
    expect(platformFromText('1 cartouche (Nintendo Switch)')).toBe('switch')
    expect(platformFromText('Cartouche (Nintendo Switch ou Sony Playstation 4)')).toBe('switch')
    expect(platformFromText('1 cartouche Super Nintendo entertainment system')).toBe('snes')
    expect(platformFromText('1 cartouche Super Famicom')).toBe('snes')
    expect(platformFromText('1 cartouche Nintendo entertainment system')).toBe('nes')
    expect(platformFromText('1 cartouche Game Boy Advance')).toBe('gba')
    expect(platformFromText('1 cartouche informatique')).toBeUndefined()
  })

  it('traduit les consoles de RAWG', () => {
    expect(platformFromRawg('playstation2')).toBe('ps2')
    expect(platformFromRawg('nintendo-ds')).toBe('nds')
    expect(platformFromRawg('inconnue')).toBeUndefined()
    const r = toRawgResult({
      id: 3498,
      name: 'Grand Theft Auto: San Andreas',
      released: '2004-10-26',
      background_image: 'https://media.rawg.io/media/games/960/x.jpg',
      genres: [{ name: 'Action' }],
      platforms: [{ platform: { slug: 'playstation2' } }, { platform: { slug: 'pc' } }],
    })
    expect(r.year).toBe(2004)
    expect(r.platforms).toEqual(['ps2', 'pc'])
    expect(r.imageUrl).toBe('https://media.rawg.io/media/crop/600/400/games/960/x.jpg')
  })
})

describe('jeux : classement (console puis titre)', () => {
  let n = 0
  const game = (title: string, platform?: Platform): Cd =>
    ({
      id: `j${++n}`, media: 'jeu', artist: 'X', artistSort: 'X', title, genres: [], styles: [], format: 'autre', discCount: 1,
      thicknessMm: 14, coverUrls: [], isCompilation: false, status: 'identifie', confidence: 95, confidenceReasons: [],
      source: 'bnf', platform, createdAt: 0, updatedAt: 0,
    }) as Cd

  it('range par console dans ton ordre, puis par titre ; les Super Nintendo gardent leur place', () => {
    const plan = buildPlan(
      [
        game('Super Mario Kart', 'snes'),
        game('Tekken 3', 'ps1'),
        game('Final Fantasy X', 'ps2'),
        game('Ape Escape', 'ps1'),
        game('Mario Kart 8 Deluxe', 'switch'),
        game('The Legend of Zelda : Breath of the Wild', 'switch'),
        game('Animal Crossing', 'switch'),
        game('Mario Kart 8', 'wiiu'),
        game('Jeu sans console'),
      ],
      defaultGameRules(),
    )
    expect(plan.themes.map((t) => t.theme.id)).toEqual(['ps1', 'ps2', 'switch', 'snes', 'autres', 'a_classer'])
    expect(plan.themes.find((t) => t.theme.id === 'ps1')!.cds.map((c) => c.title)).toEqual(['Ape Escape', 'Tekken 3'])
    expect(plan.themes.find((t) => t.theme.id === 'switch')!.cds.map((c) => c.title)).toEqual([
      'Animal Crossing',
      'The Legend of Zelda : Breath of the Wild',
      'Mario Kart 8 Deluxe',
    ])
    expect(plan.merges).toEqual([])
    expect(plan.unclassified[0].reason).toBe('Console inconnue')
  })

  it('une console ajoutée comme thème passe avant « Autres consoles »', () => {
    const rules = defaultGameRules()
    rules.themes.push({ id: 'ps4', name: 'PlayStation 4', color: '#000', keywords: ['PlayStation 4'], sortBy: 'titre' })
    const plan = buildPlan([game('Uncharted 4', 'ps4'), game('Mario Kart 8', 'wiiu')], rules)
    expect(plan.placement.get(plan.themes.find((t) => t.theme.id === 'ps4')!.cds[0].id)?.themeId).toBe('ps4')
    expect(plan.themes.find((t) => t.theme.id === 'autres')!.cds.map((c) => c.title)).toEqual(['Mario Kart 8'])
  })
})

describe('consoles ajoutées le 16/11/2026', () => {
  it('reconnaît les consoles rétro, les plus précises d’abord', () => {
    expect(platformFromText('1 cartouche Game Boy Color')).toBe('gbc')
    expect(platformFromText('1 cartouche Game Boy')).toBe('gb')
    expect(platformFromText('1 HuCard (PC Engine)')).toBe('pce')
    expect(platformFromText('1 disque optique numérique (PC Engine CD-ROM²)')).toBe('pcecd')
    expect(platformFromText('1 cartouche Neo Geo Pocket Color')).toBe('ngpc')
    expect(platformFromText('1 disque (Neo Geo CD)')).toBe('neogeocd')
    expect(platformFromText('1 cartouche Neo-Geo')).toBe('neogeo')
    expect(platformFromText('1 cartouche WonderSwan Color')).toBe('wsc')
    expect(platformFromText('1 disque optique numérique (Sega Saturn)')).toBe('saturn')
    expect(platformFromText('1 disque (Mega-CD)')).toBe('megacd')
    expect(platformFromText('1 cartouche Mega Drive 32X')).toBe('s32x')
    expect(platformFromText('1 cartouche Mega Drive')).toBe('md')
    expect(platformFromText('1 disque (Amiga CD32)')).toBe('cd32')
    expect(platformFromText('2 disquettes Amiga')).toBe('amiga')
    expect(platformFromText('1 disque compact interactif (CD-i)')).toBe('cdi')
    expect(platformFromText('1 cartouche Videopac')).toBe('odyssey')
    expect(platformFromText('1 cartouche Nokia N-Gage')).toBe('ngage')
    expect(platformFromText('1 cédérom (PC)')).toBe('pc')
    expect(platformFromRawg('sega-saturn')).toBe('saturn')
    expect(platformFromRawg('game-boy-color')).toBe('gbc')
  })

  it('tes thèmes existants : les nouvelles consoles rejoignent « Autres consoles »', () => {
    const old = defaultGameRules()
    const autres = old.themes.find((t) => t.id === 'autres')!
    autres.keywords = autres.keywords.filter((k) => !['Saturn', 'Game Boy Color'].includes(k))
    const after = withNewPlatforms(old)
    expect(after.themes.find((t) => t.id === 'autres')!.keywords).toEqual(expect.arrayContaining(['Saturn', 'Game Boy Color']))
    expect(after.themes.map((t) => t.id)).toEqual(old.themes.map((t) => t.id))
    // Même sans ce rattrapage (sauvegarde d'un ancien appareil), un jeu Saturn va dans « Autres consoles ».
    const saturn = { id: 'sat1', media: 'jeu', platform: 'saturn', title: 'Panzer Dragoon', artist: 'Sega', artistSort: 'Sega', genres: [], styles: [] } as unknown as Cd
    expect(buildPlan([saturn], old).placement.get('sat1')?.themeId).toBe('autres')
  })
})

describe('Mes consoles', () => {
  it('un ami avec une Switch et une PS4 : ses deux consoles, puis « Autres consoles »', () => {
    const rules = defaultGameRules(['switch', 'ps4'])
    expect(rules.themes.map((t) => t.id)).toEqual(['switch', 'ps4', 'autres'])
    const autres = rules.themes.find((t) => t.id === 'autres')!
    expect(autres.keywords).toContain('PlayStation 2')
    expect(autres.keywords).not.toContain('PlayStation 4')
  })

  it('changer ses consoles garde les noms, couleurs et thèmes ajoutés à la main', () => {
    const before = defaultGameRules()
    before.themes[0] = { ...before.themes[0], name: 'PS1 (salon)' }
    before.themes.push({ id: 'collector', name: 'Éditions collector', color: '#000', keywords: [], sortBy: 'titre' })
    const after = withPlatforms(before, ['ps2', 'ps1', 'switch'])
    expect(after.themes.map((t) => t.id)).toEqual(['ps2', 'ps1', 'switch', 'autres', 'collector'])
    expect(after.themes[1].name).toBe('PS1 (salon)')
    expect(after.themes.find((t) => t.id === 'autres')!.keywords).toContain('Nintendo DS')
    // Un jeu DS (console retirée) va dans « Autres consoles ».
    let k = 0
    const ds = { id: `ds${++k}`, media: 'jeu', platform: 'nds', title: 'Zelda', artist: 'N', artistSort: 'N', genres: [], styles: [] } as unknown as Cd
    expect(buildPlan([ds], after).placement.get(ds.id)?.themeId).toBe('autres')
  })
})
