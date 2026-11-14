import { describe, expect, it } from 'vitest'
import { editDistance, fuzzyFilter, fuzzyScore } from './fuzzy'

describe('recherche tolérante', () => {
  it('compte les fautes entre deux mots', () => {
    expect(editDistance('beatles', 'beatles')).toBe(0)
    expect(editDistance('beatls', 'beatles')).toBe(1)
    expect(editDistance('brasens', 'brassens')).toBe(1)
  })

  it('ignore accents et majuscules', () => {
    expect(fuzzyScore('mylene', 'Mylène Farmer')).toBe(0)
    expect(fuzzyScore('ETIENNE', 'Étienne Daho')).toBe(0)
  })

  it('accepte une petite faute de frappe', () => {
    expect(fuzzyScore('beatls', 'The Beatles — Rubber Soul')).not.toBeNull()
    expect(fuzzyScore('brasens copain', "Georges Brassens — Les Copains d'abord")).not.toBeNull()
    expect(fuzzyScore('radiohaed', 'Radiohead — OK Computer')).not.toBeNull()
  })

  it('trouve en cours de frappe (début de mot)', () => {
    expect(fuzzyScore('nirv', 'Nirvana — Nevermind')).toBe(0)
    expect(fuzzyScore('nevermi', 'Nirvana — Nevermind')).toBe(0)
  })

  it('refuse ce qui ne correspond pas', () => {
    expect(fuzzyScore('abba', 'Nirvana — Nevermind')).toBeNull()
    expect(fuzzyScore('air', 'Blur — Parklife')).toBeNull() // mot court : pas de faute tolérée
  })

  it('classe les meilleures correspondances en premier', () => {
    const list = ['Blur — Parklife', 'Bluur — Démo', 'The Blues Brothers']
    expect(fuzzyFilter(list, 'blur', (x) => x)[0]).toBe('Blur — Parklife')
  })
})
