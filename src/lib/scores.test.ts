import { describe, expect, it } from 'vitest'
import type { Cd } from '../db/types'
import { mbScores } from '../services/identify'
import { toOmdbScores } from '../services/omdb'
import { toRawgResult } from '../services/rawg'
import { scoreChips } from './scores'

// Avis extérieurs : Metacritic (RAWG, OMDb), IMDb, Rotten Tomatoes, MusicBrainz.

describe('avis extérieurs', () => {
  it('OMDb : Metacritic, IMDb et Rotten Tomatoes ; « N/A » = pas de note', () => {
    expect(
      toOmdbScores({
        Response: 'True',
        imdbID: 'tt0078748',
        Metascore: '89',
        imdbRating: '8.5',
        Ratings: [
          { Source: 'Internet Movie Database', Value: '8.5/10' },
          { Source: 'Rotten Tomatoes', Value: '93%' },
        ],
      }),
    ).toEqual({ imdbId: 'tt0078748', metacritic: 89, imdb: 8.5, rottenTomatoes: 93 })
    expect(toOmdbScores({ Response: 'True', Metascore: 'N/A', imdbRating: 'N/A' })).toEqual({
      imdbId: undefined,
      metacritic: undefined,
      imdb: undefined,
      rottenTomatoes: undefined,
    })
    expect(toOmdbScores({ Response: 'False', Error: 'Movie not found!' })).toBeUndefined()
  })

  it('RAWG donne la note Metacritic des jeux', () => {
    expect(toRawgResult({ id: 1, name: 'Okami', metacritic: 93 }).metacritic).toBe(93)
    expect(toRawgResult({ id: 2, name: 'Inconnu', metacritic: null }).metacritic).toBeUndefined()
  })

  it('MusicBrainz : note sur 5 ramenée sur 100', () => {
    expect(mbScores({ rating: { value: 4.3, 'votes-count': 12 } })).toEqual({ musicbrainz: 86, musicbrainzVotes: 12 })
    expect(mbScores({ rating: { value: null, 'votes-count': 0 } })).toEqual({})
  })

  it('pastilles affichées, dans l’ordre ; MusicBrainz seulement à partir de 3 votes', () => {
    const cd = { title: 'Alien', imdbId: 'tt0078748', scores: { metacritic: 89, imdb: 8.5, rottenTomatoes: 93 } } as Cd
    expect(scoreChips(cd).map((c) => `${c.short} ${c.text}`)).toEqual(['MC 89', 'IMDb 8,5', 'RT 93 %'])
    expect(scoreChips(cd)[1].url).toBe('https://www.imdb.com/title/tt0078748/')
    expect(scoreChips({ title: 'X', scores: { musicbrainz: 80, musicbrainzVotes: 2 } } as Cd)).toEqual([])
  })
})
