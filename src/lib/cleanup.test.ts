import { describe, expect, it } from 'vitest'
import { cleanTags, isJunkTag, isLatin, latinArtistName, uninvertSortName } from './cleanup'

describe('nettoyage des données', () => {
  it('repère les étiquettes MusicBrainz parasites (vues dans ta collection)', () => {
    for (const t of ['Fix Pseudo-Releases', 'Fixme Release Events', 'No Isrc', 'Buyee Mercari', 'Rayé', '2026', '11.60€', 'Full Credits']) {
      expect(isJunkTag(t)).toBe(true)
    }
    for (const t of ['Rock', 'Hip-Hop', 'Video Game', 'Vgm', 'Post-Punk', 'Folk, World, & Country', 'Anime']) {
      expect(isJunkTag(t)).toBe(false)
    }
    expect(cleanTags(['Soundtrack', 'No Isrc', 'Video Game'])).toEqual(['Soundtrack', 'Video Game'])
  })

  it('reconnaît l’alphabet latin', () => {
    expect(isLatin('Mylène Farmer')).toBe(true)
    expect(isLatin('Kapela Špalíček')).toBe(true)
    expect(isLatin('‐M‐')).toBe(true)
    expect(isLatin('植松伸夫')).toBe(false)
    expect(isLatin('菅野よう子、シートベルツ')).toBe(false)
  })

  it('affiche les noms japonais en lettres latines quand c’est possible', () => {
    expect(uninvertSortName('Uematsu, Nobuo')).toBe('Nobuo Uematsu')
    expect(uninvertSortName('Beatles, The')).toBe('The Beatles')
    expect(latinArtistName('植松伸夫', 'Uematsu, Nobuo')).toBe('Nobuo Uematsu')
    expect(latinArtistName('倉木麻衣', '倉木麻衣')).toBeNull() // pas de nom latin connu
    expect(latinArtistName('Sting', 'Sting')).toBeNull()
  })
})
