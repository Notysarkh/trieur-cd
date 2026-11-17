import { describe, expect, it } from 'vitest'
import type { Candidate, Cd } from '../db/types'
import { gameDraftFromRawg } from './games'
import { alreadyOwned, bestGameCandidate, draftForPhotoGame } from './photoGames'
import { platformOf } from './vision'

// Jeux lus sur une photo par Claude → recherche RAWG/BnF → fiches.

const cand = (id: number, title: string, platforms: Cd['platform'][] = ['ps2']): Candidate => ({
  key: `rawg:${id}`,
  draft: gameDraftFromRawg({ id, title, genres: [], platforms: platforms as never }, platforms[0]),
  enriched: true,
})

describe('jeux par photo', () => {
  it('console renvoyée par Claude : identifiant ou texte', () => {
    expect(platformOf('ps2')).toBe('ps2')
    expect(platformOf('PlayStation 2')).toBe('ps2')
    expect(platformOf('Game Boy Color')).toBe('gbc')
    expect(platformOf('inconnue')).toBeUndefined()
  })

  it('retient le résultat au même titre, même avec « Platinum » ou des accents', () => {
    const cands = [cand(1, 'Okami HD'), cand(2, 'Ōkami'), cand(3, 'Okamiden')]
    expect(bestGameCandidate(cands, 'Okami Platinum')?.key).toBe('rawg:2')
    expect(bestGameCandidate([cand(4, 'Final Fantasy X/X-2 HD Remaster'), cand(5, 'Final Fantasy X')], 'FINAL FANTASY X')?.key).toBe('rawg:5')
    expect(bestGameCandidate([cand(6, 'Tekken 3')], 'Gran Turismo 4')).toBeUndefined()
  })

  it('jeu déjà dans la collection (même titre et même console)', () => {
    const all = [{ media: 'jeu', title: 'Okami', platform: 'ps2' }] as Cd[]
    expect(alreadyOwned(all, 'OKAMI', 'ps2')).toBeTruthy()
    expect(alreadyOwned(all, 'Okami', 'switch')).toBeUndefined()
  })

  it('fiche : identifiée si lecture sûre et jeu trouvé, sinon « à vérifier »', () => {
    const sure = draftForPhotoGame({ seen: { title: 'Okami', platform: 'ps2', confidence: 'haute' }, candidates: [], chosen: cand(2, 'Ōkami') }, 'ps2')
    expect(sure).toMatchObject({ status: 'identifie', platform: 'ps2', noBarcode: true, heightCm: 19 })
    const unsure = draftForPhotoGame({ seen: { title: 'Okm', confidence: 'basse' }, candidates: [] }, undefined)
    expect(unsure.status).toBe('a_verifier')
    expect(unsure.title).toBe('Okm')
    expect(unsure.confidenceReasons).toContain('Console à choisir')
  })
})
