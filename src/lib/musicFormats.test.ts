import { describe, expect, it } from 'vitest'
import type { Cd } from '../db/types'
import { heightOf, widthOf } from '../layout/furniture'
import { draftFromDiscogs, draftFromMbRelease } from '../services/identify'
import { musicFormatFromMb, musicFormatFromText, musicSize } from './musicFormats'

// Musique : supports (CD, vinyle, cassette, MiniDisc, SA-CD, DVD-Audio, Blu-ray Pure Audio).

describe('supports de musique', () => {
  it('lit le support écrit par MusicBrainz ou Discogs', () => {
    expect(musicFormatFromMb([{ format: '12" Vinyl' }, { format: '12" Vinyl' }])).toBe('vinyle')
    expect(musicFormatFromMb([{ format: '7" Vinyl' }])).toBe('vinyle45')
    expect(musicFormatFromMb([{ format: 'Cassette' }])).toBe('cassette')
    expect(musicFormatFromMb([{ format: 'Hybrid SACD' }])).toBe('sacd')
    expect(musicFormatFromMb([{ format: 'DVD-Audio' }])).toBe('dvda')
    expect(musicFormatFromMb([{ format: 'Blu-ray' }])).toBe('bdaudio')
    expect(musicFormatFromMb([{ format: 'MiniDisc' }])).toBe('minidisc')
    expect(musicFormatFromMb([{ format: 'CD' }])).toBeUndefined()
    expect(musicFormatFromText('Vinyl LP Album Reissue')).toBe('vinyle')
    expect(musicFormatFromText('Vinyl 7" 45 RPM Single')).toBe('vinyle45')
    expect(musicFormatFromText('Minidisc Album')).toBe('minidisc')
    expect(musicFormatFromText('CD Album Digipak')).toBeUndefined()
  })

  it('dimensions : vinyle par disque, CD selon le boîtier', () => {
    expect(musicSize('vinyle', 2)).toEqual({ thicknessMm: 8, heightCm: 31.5 })
    expect(musicSize('cassette', 1)).toEqual({ thicknessMm: 17, heightCm: 11 })
    expect(musicSize('cd', 1)).toBeNull()
    expect(musicSize('sacd', 1)).toBeNull()
  })

  it('une édition vinyle de MusicBrainz devient une fiche « Vinyle 33 tours »', () => {
    const d = draftFromMbRelease({ id: 'r1', title: 'Abbey Road', media: [{ format: '12" Vinyl' }] })
    expect(d.musicFormat).toBe('vinyle')
    expect(d.thicknessMm).toBe(4)
    expect(d.heightCm).toBe(31.5)
    const cd = draftFromMbRelease({ id: 'r2', title: 'Abbey Road', media: [{ format: 'CD' }] })
    expect(cd.musicFormat).toBeUndefined()
    expect(cd.heightCm).toBeUndefined()
  })

  it('une cassette de Discogs', () => {
    const d = draftFromDiscogs({ id: 9, type: 'release', title: 'Renaud - Morgane De Toi', format: ['Cassette', 'Album'], format_quantity: 1 })
    expect(d.musicFormat).toBe('cassette')
    expect(d.thicknessMm).toBe(17)
  })

  it('hauteur et largeur pour le rangement, selon le support', () => {
    const disc = (extra: Partial<Cd>) => ({ artist: 'A', title: 'T', ...extra }) as Cd
    expect(heightOf(disc({}))).toBe(12.5)
    expect(heightOf(disc({ musicFormat: 'vinyle' }))).toBe(31.5)
    expect(widthOf(disc({ musicFormat: 'cassette' }))).toBe(7)
    expect(widthOf(disc({}))).toBe(14.2)
  })
})
