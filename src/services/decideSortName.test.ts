import { describe, expect, it } from 'vitest'
import { decideSortName } from './classification'

describe('nom de tri corrigé d’après MusicBrainz', () => {
  it('reprend le « Nom, Prénom » de MusicBrainz', () => {
    expect(decideSortName({ name: 'Joan Baez', sort: 'Joan Baez' }, { name: 'Joan Baez', 'sort-name': 'Baez, Joan' })).toBe('Baez, Joan')
  })

  it('ne touche pas aux noms de scène que MusicBrainz trie tels quels', () => {
    for (const n of ['Fatboy Slim', 'Cœur de pirate', 'Square Tune Magician']) {
      expect(decideSortName({ name: n, sort: n }, { name: n, 'sort-name': n })).toBeNull()
    }
    // « Oisives, Les » est déjà bien rangé : MusicBrainz (« Les Oisives ») n'apprend rien
    expect(decideSortName({ name: 'Les Oisives', sort: 'Oisives, Les' }, { name: 'Les Oisives', 'sort-name': 'Les Oisives' })).toBeNull()
  })

  it('passe en lettres latines un nom de tri japonais', () => {
    expect(decideSortName({ name: '倉木麻衣', sort: '倉木麻衣' }, { name: '倉木麻衣', 'sort-name': 'Kuraki, Mai' })).toBe('Kuraki, Mai')
  })

  it('inconnu de MusicBrainz : trie d’après le nom affiché si le nom de tri n’a rien à voir', () => {
    expect(decideSortName({ name: 'Peters Sisters', sort: 'Three Peters Sisters, The' }, undefined)).toBe('Peters Sisters')
    expect(decideSortName({ name: 'Mano Solo', sort: 'Mano Solo' }, undefined)).toBeNull()
  })
})
