import { describe, expect, it } from 'vitest'
import type { ArtistInfo, Cd } from '../db/types'
import { artistKey, buildPlan } from './engine'
import { defaultRules, UNCLASSIFIED, type ClassificationRules } from './themes'

// Tests du moteur de classement, sur une petite collection inventée.

let n = 0
function cd(artist: string, title: string, extra: Partial<Cd> = {}): Cd {
  n++
  return {
    id: `cd${n}`,
    artist,
    artistSort: extra.artistSort ?? artist,
    title,
    genres: [],
    styles: [],
    format: 'standard',
    discCount: 1,
    thicknessMm: 10.4,
    coverUrls: [],
    isCompilation: false,
    status: 'identifie',
    confidence: 90,
    confidenceReasons: [],
    source: 'musicbrainz',
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }
}

/** Règles par défaut sans regroupement automatique (pour tester une chose à la fois). */
function rules(changes: Partial<ClassificationRules> = {}): ClassificationRules {
  return { ...defaultRules(), minCdsPerTheme: 0, maxThemes: 99, ...changes }
}

function themeOf(plan: ReturnType<typeof buildPlan>, cdId: string) {
  return plan.placement.get(cdId)?.themeId
}

describe('clé d’artiste', () => {
  it('reconnaît le même artiste écrit différemment', () => {
    expect(artistKey('The Beatles')).toBe(artistKey('Beatles, The'))
    expect(artistKey('Georges Brassens')).toBe(artistKey('Brassens, Georges'))
    expect(artistKey('Daft Punk feat. Pharrell Williams')).toBe(artistKey('Daft Punk'))
    expect(artistKey('Simon & Garfunkel')).not.toBe(artistKey('Simon'))
  })
})

describe('genres → thèmes', () => {
  const r = rules()
  it('préfère le mot-clé le plus précis', () => {
    const a = cd('X', 'A', { styles: ['Pop Rock'] })
    const b = cd('Y', 'B', { styles: ['Baroque Pop'] })
    const c = cd('Z', 'C', { styles: ['Rock Opera'] })
    const d = cd('W', 'D', { genres: ['Funk / Soul'] })
    const e = cd('V', 'E', { genres: ['Stage & Screen'], styles: ['Soundtrack'] })
    const plan = buildPlan([a, b, c, d, e], r)
    expect(themeOf(plan, a.id)).toBe('rock')
    expect(themeOf(plan, b.id)).toBe('pop')
    expect(themeOf(plan, c.id)).toBe('rock')
    expect(themeOf(plan, d.id)).toBe('soul')
    expect(themeOf(plan, e.id)).toBe('bo')
  })
})

describe('un artiste = un seul thème', () => {
  it('range tous les albums d’un artiste dans son thème majoritaire', () => {
    const cds = [
      cd('David Bowie', 'Ziggy Stardust', { year: 1972, styles: ['Glam Rock'] }),
      cd('David Bowie', 'Let’s Dance', { year: 1983, styles: ['Synth Pop'] }),
      cd('David Bowie', 'Heroes', { year: 1977, styles: ['Art Rock'] }),
    ]
    const plan = buildPlan(cds, rules())
    expect(new Set(cds.map((c) => themeOf(plan, c.id)))).toEqual(new Set(['rock']))
    // Albums dans l'ordre chronologique
    const rock = plan.themes.find((t) => t.theme.id === 'rock')!
    expect(rock.cds.map((c) => c.year)).toEqual([1972, 1977, 1983])
  })

  it('signale un artiste partagé entre deux thèmes', () => {
    const cds = [
      cd('Artiste', 'Un', { styles: ['Jazz'] }),
      cd('Artiste', 'Deux', { styles: ['House'] }),
    ]
    const plan = buildPlan(cds, rules())
    expect(plan.disputed.map((a) => a.name)).toEqual(['Artiste'])
  })
})

describe('catégories spéciales', () => {
  it('envoie les compilations multi-artistes dans Compilations, sauf les BO', () => {
    const comp = cd('Various Artists', 'Now 42', { isCompilation: true, styles: ['Pop'] })
    const bo = cd('Various Artists', 'Pulp Fiction', { isCompilation: true, releaseTypes: ['Soundtrack', 'Compilation'] })
    const plan = buildPlan([comp, bo], rules())
    expect(themeOf(plan, comp.id)).toBe('compilations')
    expect(themeOf(plan, bo.id)).toBe('bo')
  })

  it('trie le classique par compositeur', () => {
    const cds = [
      cd('Herbert von Karajan', 'Symphonie 9', { composer: 'Beethoven', genres: ['Classical'], year: 1963 }),
      cd('Glenn Gould', 'Variations Goldberg', { composer: 'Bach', genres: ['Classical'], year: 1955 }),
    ]
    const plan = buildPlan(cds, rules())
    const classique = plan.themes.find((t) => t.theme.id === 'classique')!
    expect(classique.cds.map((c) => c.composer)).toEqual(['Bach', 'Beethoven'])
  })

  it('range les BO par titre de film', () => {
    const cds = [
      cd('John Williams', 'Star Wars', { releaseTypes: ['Soundtrack'] }),
      cd('Ennio Morricone', 'The Good, the Bad and the Ugly', { releaseTypes: ['Soundtrack'] }),
      cd('Vangelis', 'Blade Runner', { releaseTypes: ['Soundtrack'] }),
    ]
    const bo = buildPlan(cds, rules()).themes.find((t) => t.theme.id === 'bo')!
    expect(bo.cds.map((c) => c.title)).toEqual(['Blade Runner', 'The Good, the Bad and the Ugly', 'Star Wars'])
  })
})

describe('musique française', () => {
  it('regroupe les artistes francophones, même sans genre', () => {
    const brel = cd('Jacques Brel', 'Ces gens-là', { language: 'fra' })
    const mylene = cd('Mylène Farmer', 'Ainsi soit je', { language: 'fra', styles: ['Synth Pop'] })
    const daft = cd('Daft Punk', 'Discovery', { language: 'eng', styles: ['French House'] })
    const plan = buildPlan([brel, mylene, daft], rules())
    expect(themeOf(plan, brel.id)).toBe('francaise')
    expect(themeOf(plan, mylene.id)).toBe('francaise')
    expect(themeOf(plan, daft.id)).toBe('electro')
  })

  it('se désactive', () => {
    const mylene = cd('Mylène Farmer', 'Ainsi soit je', { language: 'fra', styles: ['Synth Pop'] })
    expect(themeOf(buildPlan([mylene], rules({ frenchTheme: false })), mylene.id)).toBe('pop')
  })

  it('laisse les artistes français instrumentaux dans leur genre', () => {
    const jarre = cd('Jean-Michel Jarre', 'Oxygène', { mbArtistId: 'j1', language: 'zxx', styles: ['Ambient'] })
    const infos = new Map<string, ArtistInfo>([
      ['j1', { mbArtistId: 'j1', name: 'Jean-Michel Jarre', country: 'FR', genres: [], tags: [], fetchedAt: 0 }],
    ])
    expect(themeOf(buildPlan([jarre], rules(), infos), jarre.id)).toBe('electro')
  })

  it('utilise le pays de l’artiste si la langue est inconnue', () => {
    const x = cd('Indochine', 'Paradize', { mbArtistId: 'a1', styles: ['New Wave'] })
    const infos = new Map<string, ArtistInfo>([
      ['a1', { mbArtistId: 'a1', name: 'Indochine', country: 'FR', genres: [], tags: [], fetchedAt: 0 }],
    ])
    expect(themeOf(buildPlan([x], rules(), infos), x.id)).toBe('francaise')
  })
})

describe('CD gravés et compilations perso (v1.1)', () => {
  it('range une compilation perso dans le thème choisi, à la fin du thème', () => {
    const cds = [
      cd('Zappa', 'Hot Rats', { styles: ['Grunge'] }),
      cd('Abba', 'Arrival', { styles: ['Grunge'] }),
      cd('Compilation perso', 'Mix été 98', { personalCompilation: true, themeOverride: 'rock' }),
      cd('Compilation perso', 'Ballades', { personalCompilation: true, themeOverride: 'rock' }),
    ]
    const rock = buildPlan(cds, rules()).themes.find((t) => t.theme.id === 'rock')!
    expect(rock.cds.map((c) => c.title)).toEqual(['Arrival', 'Hot Rats', 'Ballades', 'Mix été 98'])
  })

  it('ne regroupe pas les compilations perso entre elles comme un seul artiste', () => {
    const cds = [
      cd('Compilation perso', 'Mix rock', { personalCompilation: true, themeOverride: 'rock' }),
      cd('Compilation perso', 'Mix jazz', { personalCompilation: true, themeOverride: 'jazz' }),
    ]
    const plan = buildPlan(cds, rules())
    expect(themeOf(plan, cds[0].id)).toBe('rock')
    expect(themeOf(plan, cds[1].id)).toBe('jazz')
  })

  it('met « À classer » une compilation perso sans thème choisi', () => {
    const x = cd('Compilation perso', 'Mystère', { personalCompilation: true })
    expect(themeOf(buildPlan([x], rules()), x.id)).toBe(UNCLASSIFIED)
  })

  it('applique le thème choisi sur la fiche d’un CD à tout l’artiste', () => {
    const a = cd('Groupe local', 'Démo 1', { noBarcode: true, themeOverride: 'jazz' })
    const b = cd('Groupe local', 'Démo 2', { styles: ['Grunge'] })
    const plan = buildPlan([a, b], rules())
    expect(themeOf(plan, a.id)).toBe('jazz')
    expect(themeOf(plan, b.id)).toBe('jazz')
  })

  it('donne la priorité au choix fait dans l’écran Classement', () => {
    const a = cd('Groupe local', 'Démo 1', { themeOverride: 'jazz' })
    const r = rules({ artistOverrides: { [artistKey('Groupe local')]: 'pop' } })
    expect(themeOf(buildPlan([a], r), a.id)).toBe('pop')
  })
})

describe('genres inconnus et règles', () => {
  it('met de côté les artistes sans genre, puis utilise les genres de l’artiste', () => {
    const x = cd('Inconnu', 'Album', { mbArtistId: 'a2' })
    expect(themeOf(buildPlan([x], rules()), x.id)).toBe(UNCLASSIFIED)
    const infos = new Map<string, ArtistInfo>([
      ['a2', { mbArtistId: 'a2', name: 'Inconnu', genres: ['Jazz'], tags: [], fetchedAt: 0 }],
    ])
    expect(themeOf(buildPlan([x], rules(), infos), x.id)).toBe('jazz')
  })

  it('respecte un artiste forcé dans un thème', () => {
    const x = cd('The Police', 'Synchronicity', { styles: ['New Wave'] })
    const r = rules({ artistOverrides: { [artistKey('The Police')]: 'pop' } })
    const plan = buildPlan([x], r)
    expect(themeOf(plan, x.id)).toBe('pop')
    expect(plan.themes[0].artists[0].forced).toBe(true)
  })

  it('regroupe un thème trop petit dans son parent', () => {
    const cds = [
      cd('Metallica', 'Black Album', { styles: ['Heavy Metal'] }),
      cd('Nirvana', 'Nevermind', { styles: ['Grunge'] }),
      cd('Pixies', 'Doolittle', { styles: ['Indie Rock'] }),
    ]
    const plan = buildPlan(cds, rules({ minCdsPerTheme: 2 }))
    expect(themeOf(plan, cds[0].id)).toBe('rock')
    expect(plan.merges.map((m) => `${m.from.id}→${m.into.id}`)).toEqual(['metal→rock'])
  })

  it('suit la chaîne des regroupements (Électro → Pop déjà regroupé dans Rock → Rock)', () => {
    const cds = [
      cd('R', '1', { styles: ['Grunge'] }),
      cd('R', '2', { styles: ['Grunge'] }),
      cd('R', '3', { styles: ['Grunge'] }),
      cd('P', '1', { styles: ['Synth Pop'] }),
      cd('E', '1', { styles: ['House'] }),
      cd('E', '2', { styles: ['House'] }),
      cd('J', '1', { styles: ['Bebop'] }),
      cd('J', '2', { styles: ['Bebop'] }),
    ]
    const plan = buildPlan(cds, rules({ minCdsPerTheme: 2, maxThemes: 2 }))
    expect(plan.themes.map((t) => t.theme.id)).toEqual(['rock', 'jazz'])
    expect(plan.merges.map((m) => `${m.from.id}→${m.into.id}`)).toEqual(['pop→rock', 'electro→rock'])
  })

  it('limite le nombre de thèmes', () => {
    const cds = [
      cd('A', '1', { styles: ['Grunge'] }),
      cd('A', '2', { styles: ['Grunge'] }),
      cd('B', '1', { styles: ['Bebop'] }),
      cd('C', '1', { styles: ['House'] }),
    ]
    const plan = buildPlan(cds, rules({ maxThemes: 2 }))
    expect(plan.themes.length).toBe(2)
  })

  it('classe 750 CD en bien moins d’une seconde', () => {
    const styles = ['Grunge', 'Bebop', 'House', 'Soul', 'Synth Pop', 'Heavy Metal', 'Reggae', 'Folk']
    const big = Array.from({ length: 750 }, (_, i) =>
      cd(`Artiste ${i % 300}`, `Album ${i}`, { styles: [styles[i % styles.length]], year: 1960 + (i % 60) }),
    )
    const plan = buildPlan(big, defaultRules())
    expect(plan.placement.size).toBe(750)
    expect(plan.durationMs).toBeLessThan(1000)
  })
})
