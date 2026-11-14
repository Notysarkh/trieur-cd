import { describe, expect, it } from 'vitest'
import { bookDraftFromBnf, estimateBookThickness, guessBookGenres, guessBookKind, isIsbn, parseSru } from './books'

// Vraies réponses du catalogue de la BnF (enregistrées le 14/11/2026).
import asterix from './fixtures/bnf-9782012101333.xml?raw'
import onePiece from './fixtures/bnf-9782723478991.xml?raw'
import dune from './fixtures/bnf-9782266320542.xml?raw'

const FIXTURES: Record<string, string> = { '9782012101333': asterix, '9782723478991': onePiece, '9782266320542': dune }
const fixture = (isbn: string) => FIXTURES[isbn]
const draftOf = (isbn: string) => bookDraftFromBnf(parseSru(fixture(isbn)).records[0], isbn)

describe('livres : ISBN', () => {
  it('reconnaît un ISBN imprimé en code-barres', () => {
    expect(isIsbn('9782012101333')).toBe(true)
    expect(isIsbn('979-10-90636-07-1')).toBe(true)
    expect(isIsbn('9790001234567')).toBe(false) // partition (ISMN)
    expect(isIsbn('0602537347230')).toBe(false) // CD
  })
})

describe('livres : notices BnF', () => {
  it('Astérix : BD, série et tome, auteurs « Nom, Prénom »', () => {
    const d = draftOf('9782012101333')
    expect(d.media).toBe('livre')
    expect(d.title).toBe('Astérix le Gaulois')
    expect(d.bookKind).toBe('bd')
    expect(d.genres).toEqual(['BD'])
    expect(d.series?.replace(/[\u0088\u0089]/g, '')).toBe("Une aventure d'Astérix")
    expect(d.volume).toBe(1)
    expect(d.artistSort).toBe('Uderzo, Albert')
    expect(d.artist).toBe('Albert Uderzo & René Goscinny')
    expect(d.label).toBe('Hachette')
    expect(d.heightCm).toBe(30)
    expect(d.pages).toBe(48)
    expect(d.thicknessMm).toBeCloseTo(9.8, 1)
  })

  it('One Piece 56 : manga (sens de lecture japonais), tome 56', () => {
    const d = draftOf('9782723478991')
    expect(d.bookKind).toBe('manga')
    expect(d.genres).toEqual(['Manga'])
    expect(d.series).toBe('One piece')
    expect(d.volume).toBe(56)
    expect(d.title).toBe('One Piece, tome 56')
    expect(d.artistSort).toBe('Oda, Eiichirō')
    expect(d.year).toBe(2011)
    expect(d.heightCm).toBe(18)
    expect(d.coverUrls.some((u) => u.includes('catalogue.bnf.fr/couverture'))).toBe(true)
  })

  it('Dune (Pocket) : roman en série, langue d’origine anglaise mais pas une BD', () => {
    const d = draftOf('9782266320542')
    expect(d.bookKind).toBe('livre')
    expect(d.series).toBe('Le cycle de Dune')
    expect(d.volume).toBe(1)
    expect(d.artistSort).toMatch(/^Herbert, Frank/)
  })
})

describe('livres : genre (hypothèses)', () => {
  const base = { forms: [], youth: false, japaneseReading: false }
  it('devine BD, manga et comics', () => {
    expect(guessBookKind({ ...base, publisher: 'Kana', originalLanguage: 'jpn', heightCm: 18 })).toBe('manga')
    expect(guessBookKind({ ...base, publisher: 'Urban comics', heightCm: 28 })).toBe('comics')
    expect(guessBookKind({ ...base, publisher: 'Dupuis', forms: ['Bandes dessinées'], heightCm: 30 })).toBe('bd')
    // Un roman japonais (Murakami) n'est pas un manga
    expect(guessBookKind({ ...base, publisher: '10-18', originalLanguage: 'jpn', heightCm: 18 })).toBe('livre')
  })
  it('devine le genre d’un roman d’après la collection, le public ou la Dewey', () => {
    expect(guessBookGenres('livre', { ...base, collection: 'Folio policier' })).toEqual(['Polar'])
    expect(guessBookGenres('livre', { ...base, collection: 'Pocket. Science-fiction' })).toEqual(['Science-fiction'])
    expect(guessBookGenres('livre', { ...base, youth: true, complement: 'roman' })).toEqual(['Jeunesse'])
    expect(guessBookGenres('livre', { ...base, dewey: '641.595 2' })).toEqual(['Pratique'])
    expect(guessBookGenres('livre', { ...base, complement: 'roman' })).toEqual(['Roman'])
    expect(guessBookGenres('livre', base)).toEqual([])
  })
  it('estime l’épaisseur d’après les pages', () => {
    expect(estimateBookThickness('manga', 208)).toBeCloseTo(14.5, 1)
    expect(estimateBookThickness('livre', 300, 18)).toBeCloseTo(17.5, 1)
    expect(estimateBookThickness('bd')).toBe(10)
  })
})

describe('livres : cas réels corrigés', () => {
  it('calcule l’ISBN à 10 chiffres (notices anciennes de la BnF)', async () => {
    const { isbn10 } = await import('./books')
    expect(isbn10('9782070360024')).toBe('2070360024')
    expect(isbn10('9782012101333')).toBe('201210133X')
    expect(isbn10('9791090636071')).toBeUndefined()
  })
  it('Open Library : L’Étranger (sujets bruités) reste un roman', async () => {
    const { bookDraftFromOpenLibrary } = await import('./books')
    const names = ['Philosophical Novels', 'Murder', 'Fiction', 'History', 'Comics & graphic novels, literary', 'Large type books']
    const d = bookDraftFromOpenLibrary({ title: "L'étranger", authors: [{ name: 'Albert Camus' }], subjects: names.map((name) => ({ name })) }, '9782070360024')
    expect(d.bookKind).toBe('livre')
    expect(d.genres).toEqual(['Roman'])
    expect(d.artistSort).toBe('Camus, Albert')
    expect(d.status).toBe('a_verifier')
  })
})

describe('livres : cadre de classement de la BnF (champ 686)', () => {
  it('Dune : SF d’après son résumé (« chef-d’œuvre de la SF ») ; 803 = roman ; 809 = jeunesse ; Masque = polar', () => {
    const d = draftOf('9782266320542')
    expect(d.genres).toEqual(['Science-fiction'])
    expect(guessBookGenres('livre', { forms: [], youth: false, japaneseReading: false, dewey: '803' })).toEqual(['Roman'])
    const base = { forms: [], youth: false, japaneseReading: false }
    expect(guessBookGenres('livre', { ...base, dewey: '809' })).toEqual(['Jeunesse'])
    expect(guessBookGenres('livre', { ...base, dewey: '803', publisher: 'Éditions du Masque' })).toEqual(['Polar'])
    expect(guessBookGenres('livre', { ...base, dewey: '944' })).toEqual(['Histoire'])
  })
})

describe('livres : nom de série nettoyé', () => {
  it('retire la ponctuation finale mais garde les lettres', () => {
    const xml = (t: string) =>
      `<srw:record><mxc:datafield tag="200" ind1="1" ind2=" "><mxc:subfield code="a">X</mxc:subfield></mxc:datafield><mxc:datafield tag="461" ind1=" " ind2="0"><mxc:subfield code="t">${t}</mxc:subfield><mxc:subfield code="v">3</mxc:subfield></mxc:datafield></srw:record>`
    expect(bookDraftFromBnf(parseSru(xml('Blacksad.')).records[0]).series).toBe('Blacksad')
    expect(bookDraftFromBnf(parseSru(xml('Les Tuniques bleues')).records[0]).series).toBe('Les Tuniques bleues')
  })
})

describe('livres : responsabilité', () => {
  it('nettoie la mention d’auteur du titre', async () => {
    const { cleanResponsibility } = await import('./books')
    expect(cleanResponsibility("[d'après Antoine de Saint-Exupéry]")).toBe('Antoine de Saint-Exupéry')
    expect(cleanResponsibility('Eiichiro Oda ; traduction Sylvain Chollet')).toBe('Eiichiro Oda')
    expect(cleanResponsibility('texte de Goscinny et dessins de Sempé')).toBe('Goscinny')
  })
})
