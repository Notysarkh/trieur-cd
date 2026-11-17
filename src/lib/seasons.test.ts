import { describe, expect, it } from 'vitest'
import { parseSru } from '../services/books'
import { filmDraftFromBnf, seasonsOf } from '../services/films'
import { toShow } from '../services/tmdb'
import { seasonContent, seasonsLabel, seasonsText } from './seasons'
// Vraie notice BnF (enregistrée le 17/11/2026) : « Sissi : l'intégrale des saisons 1 à 3 », 6 BD vidéo.
import sissi from '../services/fixtures/bnf-coffret-3545020090053.xml?raw'

describe('coffrets de séries', () => {
  it('écrit les saisons en suites', () => {
    expect(seasonsText([1, 2, 3, 5])).toBe('1 à 3, 5')
    expect(seasonsText([2, 1])).toBe('1, 2')
    expect(seasonsLabel([4])).toBe('saison 4')
    expect(seasonsLabel([1, 2, 3])).toBe('saisons 1 à 3')
    expect(seasonContent('Friends', 3)).toBe('Friends — saison 3')
  })

  it('lit les saisons dans le titre', () => {
    expect(seasonsOf("l'intégrale des saisons 1 à 3").seasons).toEqual([1, 2, 3])
    expect(seasonsOf('intégrale saisons 1 et 2').seasons).toEqual([1, 2])
    expect(seasonsOf('Shetland Intégrale saisons 1 à 4').seasons).toEqual([1, 2, 3, 4])
    expect(seasonsOf("l'intégrale de la série").seasons).toBeUndefined()
  })

  it('BnF : un coffret de série avec ses saisons, rangé à la place de sa première saison', () => {
    const d = filmDraftFromBnf(parseSru(sissi).records[0], '3545020090053')
    expect(d.boxSet).toBe(true)
    expect(d.seasons).toEqual([1, 2, 3])
    expect(d.volume).toBe(1)
    expect(d.series).toBe('Sissi')
    expect(d.contents).toEqual(['Sissi — saison 1', 'Sissi — saison 2', 'Sissi — saison 3'])
  })

  it('TMDB : une série et ses saisons, dans l’ordre', () => {
    const s = toShow({
      id: 1668,
      name: 'Friends',
      first_air_date: '1994-09-22',
      created_by: [{ name: 'David Crane' }],
      genres: [{ name: 'Comédie' }],
      seasons: [
        { season_number: 2, name: 'Saison 2', air_date: '1995-09-21', episode_count: 24 },
        { season_number: 0, name: 'Épisodes spéciaux', air_date: null },
        { season_number: 1, name: 'Saison 1', air_date: '1994-09-22', episode_count: 24 },
      ],
    })
    expect(s.seasons.map((x) => x.number)).toEqual([0, 1, 2])
    expect(s).toMatchObject({ year: 1994, creator: 'David Crane', genres: ['Comédie'] })
  })
})
