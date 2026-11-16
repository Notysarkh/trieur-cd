import { describe, expect, it } from 'vitest'
import { buildPlan } from '../classification/engine'
import { defaultVideoRules } from '../classification/themes'
import type { Cd } from '../db/types'
import { parseSru } from './books'
import { filmDraftFromBnf, filmGenres, videoFormatFrom, videoSize } from './films'
import { bestTmdbMatch } from './tmdb'

// Vraies réponses du catalogue de la BnF (enregistrées le 14/11/2026).
import amelieDvd from './fixtures/bnf-3384442032803.xml?raw'
import intouchablesBr from './fixtures/bnf-3384442252324.xml?raw'
import intouchablesDvd from './fixtures/bnf-3384442252317.xml?raw'

const draftOf = (xml: string, ean: string) => filmDraftFromBnf(parseSru(xml).records[0], ean)

describe('films : notices BnF', () => {
  it('Amélie Poulain (DVD) : réalisateur, comédie, DVD', () => {
    const d = draftOf(amelieDvd, '3384442032803')
    expect(d.media).toBe('video')
    expect(d.title).toBe("Le fabuleux destin d'Amélie Poulain")
    expect(d.artist).toBe('Jean-Pierre Jeunet')
    expect(d.artistSort).toBe('Jeunet, Jean-Pierre')
    expect(d.videoFormat).toBe('dvd')
    expect(d.genres.join(' ')).toMatch(/comédie/)
    expect(d.heightCm).toBe(19)
    expect(d.thicknessMm).toBe(14)
  })

  it('Intouchables (Blu-ray, notice pauvre) : Blu-ray reconnu, genre à compléter', () => {
    const d = draftOf(intouchablesBr, '3384442252324')
    expect(d.videoFormat).toBe('bluray')
    expect(d.heightCm).toBe(17)
    expect(d.genres).toEqual([])
    expect(d.confidence).toBe(85)
  })

  it('Intouchables (DVD) : deux réalisateurs, le premier sert au tri', () => {
    const d = draftOf(intouchablesDvd, '3384442252317')
    expect(d.artistSort).toBe('Toledano, Éric')
    expect(d.genres.join(' ')).toMatch(/comédie/)
  })
})

describe('films : support, genres, épaisseur', () => {
  it('lit le support et le nombre de disques', () => {
    expect(videoFormatFrom('2 DVD vidéo monofaces simple couche zone 2 (2 h)')).toEqual({ format: 'dvd', discCount: 2 })
    expect(videoFormatFrom('5 BD vidéo (8 h 55 min)')).toEqual({ format: 'bluray', discCount: 5 })
    expect(videoFormatFrom('1 disque Blu-ray 4K Ultra HD')).toEqual({ format: 'uhd', discCount: 1 })
    expect(videoSize('dvd', 5).thicknessMm).toBe(28)
  })
  it('anciens et autres supports : VHS, Betamax, LaserDisc, HD DVD, clé USB', () => {
    expect(videoFormatFrom('2 vidéocassettes (VHS) (3 h 10 min) : coul., SECAM')).toEqual({ format: 'vhs', discCount: 2 })
    expect(videoFormatFrom('1 vidéocassette (Betamax)')).toEqual({ format: 'betamax', discCount: 1 })
    expect(videoFormatFrom('2 vidéodisques (LaserDisc)')).toEqual({ format: 'laserdisc', discCount: 2 })
    expect(videoFormatFrom('1 disque HD DVD')).toEqual({ format: 'hddvd', discCount: 1 })
    expect(videoFormatFrom('1 clé USB')).toEqual({ format: 'usb', discCount: 1 })
    expect(videoSize('vhs', 2)).toEqual({ thicknessMm: 50, heightCm: 20.5 })
    expect(videoSize('laserdisc', 1)).toEqual({ thicknessMm: 5, heightCm: 31 })
  })
  it('garde les vrais genres ; une série télévisée devient « Série TV »', () => {
    expect(filmGenres(['film policier, thriller, espionnage', 'fiction', 'édition vidéo commerciale'])).toEqual(['film policier, thriller, espionnage'])
    expect(filmGenres(["film d'aventures et d'action", 'fiction', "document d'origine : diffusion à la télévision"], 5)).toEqual(['Série TV'])
    // Un seul disque diffusé à la télé : un film (« La Cité de la peur »), pas une série
    expect(filmGenres(['film burlesque, comédie', "document d'origine : diffusion à la télévision"], 1)).toEqual(['film burlesque, comédie'])
  })
  it('choisit le bon résultat TMDB', () => {
    const r = (title: string, originalTitle?: string) => ({ id: 1, kind: 'movie' as const, title, originalTitle, genres: [] })
    expect(bestTmdbMatch([r('Intouchables 2'), r('Intouchables')], 'Intouchables')?.title).toBe('Intouchables')
    expect(bestTmdbMatch([r('Le Trône de fer', 'Game of Thrones')], 'Game of thrones')?.title).toBe('Le Trône de fer')
  })
})

describe('films : classement (genre puis titre, DVD et Blu-ray mélangés)', () => {
  let n = 0
  const film = (title: string, genres: string[], extra: Partial<Cd> = {}): Cd =>
    ({
      id: `f${++n}`, media: 'video', artist: 'X', artistSort: 'X', title, genres, styles: [], format: 'autre', discCount: 1,
      thicknessMm: 14, coverUrls: [], isCompilation: false, status: 'identifie', confidence: 90, confidenceReasons: [],
      source: 'bnf', createdAt: 0, updatedAt: 0, ...extra,
    }) as Cd

  it('range par genre puis par titre ; les saisons d’une série restent ensemble', () => {
    const cds = [
      film('Le Fabuleux Destin d’Amélie Poulain', ['film burlesque, comédie'], { videoFormat: 'dvd' }),
      film('Intouchables', ['film burlesque, comédie'], { videoFormat: 'bluray' }),
      film('Astérix et Obélix : Mission Cléopâtre', ['film burlesque, comédie']),
      film('Game of thrones, saison 2', ['Série TV'], { series: 'Game of thrones', volume: 2 }),
      film('Game of thrones, saison 1', ['Série TV'], { series: 'Game of thrones', volume: 1 }),
      film('Breaking Bad, saison 1', ['Série TV'], { series: 'Breaking Bad', volume: 1 }),
    ]
    const plan = buildPlan(cds, defaultVideoRules())
    expect(plan.themes.find((t) => t.theme.id === 'comedie')!.cds.map((c) => c.title)).toEqual([
      'Astérix et Obélix : Mission Cléopâtre',
      'Le Fabuleux Destin d’Amélie Poulain',
      'Intouchables',
    ])
    expect(plan.themes.find((t) => t.theme.id === 'series')!.cds.map((c) => c.title)).toEqual([
      'Breaking Bad, saison 1',
      'Game of thrones, saison 1',
      'Game of thrones, saison 2',
    ])
  })

  it('un film forcé dans un thème (écran Classement) n’entraîne que lui', () => {
    const a = film('A', ['film burlesque, comédie'])
    const b = film('B', ['film burlesque, comédie'])
    const rules = { ...defaultVideoRules(), cdOverrides: { [a.id]: 'drame' } }
    const plan = buildPlan([a, b], rules)
    expect(plan.placement.get(a.id)?.themeId).toBe('drame')
    expect(plan.placement.get(b.id)?.themeId).toBe('comedie')
  })
})
