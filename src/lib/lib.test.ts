import { describe, expect, it } from 'vitest'
import { barcodeVariants, canonicalBarcode, isValidGtin, sameBarcode } from './barcode'
import { formatFromDiscogs, formatFromMusicBrainz } from './formats'
import { cleanDiscogsArtist, guessSortName } from './sortName'
import { similarity, yearFrom } from './text'
import { Throttle } from './throttle'

// Tests automatiques des petits outils (lancer avec : npm test).

describe('codes-barres', () => {
  it('accepte les codes valides (EAN-13, UPC-A, EAN-8)', () => {
    expect(isValidGtin('0077774644020')).toBe(true)
    expect(isValidGtin('077774644020')).toBe(true)
    expect(isValidGtin('5099902987125')).toBe(true)
    expect(isValidGtin('96385074')).toBe(true)
  })
  it('refuse une clé de contrôle fausse ou une longueur bizarre', () => {
    expect(isValidGtin('0077774644021')).toBe(false)
    expect(isValidGtin('12345')).toBe(false)
    expect(isValidGtin('abc')).toBe(false)
  })
  it('considère UPC-A et EAN-13 avec 0 initial comme le même code', () => {
    expect(canonicalBarcode('077774644020')).toBe('0077774644020')
    expect(sameBarcode('077774644020', '0 77774-64402 0')).toBe(true)
    expect(barcodeVariants('077774644020')).toEqual(['0077774644020', '077774644020'])
    expect(barcodeVariants('5099902987125')).toEqual(['5099902987125'])
  })
})

describe('nom de tri', () => {
  it("déplace l'article à la fin", () => {
    expect(guessSortName('The Beatles')).toBe('Beatles, The')
    expect(guessSortName('Les Rita Mitsouko')).toBe('Rita Mitsouko, Les')
    expect(guessSortName("L'Affaire Louis Trio")).toBe("Affaire Louis Trio, L'")
    expect(guessSortName('La Femme')).toBe('Femme, La')
  })
  it('laisse les autres noms tels quels', () => {
    expect(guessSortName('Georges Brassens')).toBe('Georges Brassens')
    expect(guessSortName('Theatre of Tragedy')).toBe('Theatre of Tragedy')
    expect(guessSortName('The')).toBe('The')
  })
  it('nettoie les homonymes Discogs', () => {
    expect(cleanDiscogsArtist('Nirvana (2)')).toBe('Nirvana')
  })
})

describe('formats', () => {
  it('lit le packaging MusicBrainz', () => {
    expect(formatFromMusicBrainz('Jewel Case', 1)).toBe('standard')
    expect(formatFromMusicBrainz('Slim Jewel Case', 1)).toBe('slim')
    expect(formatFromMusicBrainz('Digipak', 1)).toBe('digipak')
    expect(formatFromMusicBrainz('Super Jewel Box', 1)).toBe('standard')
    expect(formatFromMusicBrainz('Jewel Case', 2)).toBe('double')
    expect(formatFromMusicBrainz(undefined, 5)).toBe('coffret')
    expect(formatFromMusicBrainz(null, 1)).toBe('standard')
  })
  it('lit les descriptions Discogs', () => {
    expect(formatFromDiscogs(['CD', 'Album', 'Digipak'], 1)).toBe('digipak')
    expect(formatFromDiscogs(['CD', 'Compilation', 'Box Set'], 4)).toBe('coffret')
    expect(formatFromDiscogs(['CD', 'Album'], 1)).toBe('standard')
  })
})

describe('textes', () => {
  it('reconnaît un même titre écrit différemment', () => {
    expect(similarity('Rubber Soul', 'Rubber Soul (Remastered)')).toBe(1)
    expect(similarity('Abbey Road', 'Abbey road')).toBe(1)
    expect(similarity('Rubber Soul', 'Revolver')).toBeLessThan(0.4)
  })
  it("extrait l'année", () => {
    expect(yearFrom('1987-04-30')).toBe(1987)
    expect(yearFrom('2001')).toBe(2001)
    expect(yearFrom(undefined)).toBeUndefined()
  })
})

describe('file d’attente espacée', () => {
  it('respecte le délai minimum entre deux appels', async () => {
    const throttle = new Throttle(50)
    const times: number[] = []
    await Promise.all([1, 2, 3].map(() => throttle.run(async () => times.push(Date.now()))))
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(45)
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(45)
  })

  it('fait passer tes demandes avant le travail de fond', async () => {
    const throttle = new Throttle(20)
    const order: string[] = []
    const job = (name: string) => async () => void order.push(name)
    const all = [
      throttle.run(job('fond 1')),
      throttle.run(job('fond 2')),
      throttle.run(job('fond 3')),
      throttle.run(job('toi'), 'high'),
    ]
    await Promise.all(all)
    // « fond 1 » était déjà parti ; ta demande passe juste après.
    expect(order).toEqual(['fond 1', 'toi', 'fond 2', 'fond 3'])
  })
})
