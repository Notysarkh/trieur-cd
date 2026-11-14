import type { BookKind, Candidate, CdDraft } from '../db/types'
import { canonicalBarcode } from '../lib/barcode'
import { normalizeText } from '../lib/text'
import { Throttle, throttledJson, throttledText, type Priority } from '../lib/throttle'

// Livres et BD (v2, étape B) : identification par ISBN et recherche par titre / auteur.
//
// Sources (gratuites, sans compte, utilisables directement depuis le navigateur) :
// 1. Catalogue de la BnF (dépôt légal : tout ce qui est publié en France, BD, mangas et comics compris).
//    Il donne l'auteur déjà au format « Nom, Prénom », la série et le tome, le nombre de pages,
//    la hauteur en cm, l'éditeur, la collection, le genre « Bandes dessinées », la langue d'origine…
// 2. Open Library, quand la BnF ne connaît pas l'ISBN (livres publiés à l'étranger), et pour les couvertures.
// Google Books n'est pas utilisé : sans clé personnelle, son quota gratuit est épuisé (vérifié le 14/11/2026).

const BNF_SRU = 'https://catalogue.bnf.fr/api/SRU'
const bnfThrottle = new Throttle(300)
const olThrottle = new Throttle(1000)

/** ISBN à 10 chiffres d'un ISBN 978… (les notices anciennes de la BnF ne connaissent que celui-là). */
export function isbn10(isbn13: string): string | undefined {
  const c = canonicalBarcode(isbn13)
  if (!/^978\d{10}$/.test(c)) return undefined
  const core = c.slice(3, 12)
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i)
  const check = (11 - (sum % 11)) % 11
  return core + (check === 10 ? 'X' : String(check))
}

/** Un ISBN imprimé en code-barres : EAN-13 commençant par 978 ou 979 (sauf 9790 = partitions). */
export function isIsbn(code: string): boolean {
  const c = canonicalBarcode(code)
  return /^97[89]\d{10}$/.test(c) && !c.startsWith('9790')
}

// ---------------------------------------------------------------------------
// Lecture des notices BnF (format UNIMARC, en XML)
// ---------------------------------------------------------------------------

export interface MarcField {
  tag: string
  sub: Record<string, string[]>
}

export interface BnfRecord {
  ark?: string
  fields: MarcField[]
}

/** Décode les entités XML (« &amp; », « &#136; »…). */
function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Découpe une réponse SRU de la BnF en notices. */
export function parseSru(xml: string): { total: number; records: BnfRecord[] } {
  const total = Number(xml.match(/<srw:numberOfRecords>(\d+)/)?.[1] ?? 0)
  const records = xml
    .split('<srw:record>')
    .slice(1)
    .map((chunk) => {
      const fields: MarcField[] = []
      const fieldRe = /<mxc:datafield tag="(\d{3})"[^>]*>([\s\S]*?)<\/mxc:datafield>/g
      let m: RegExpExecArray | null
      while ((m = fieldRe.exec(chunk))) {
        const sub: Record<string, string[]> = {}
        const subRe = /<mxc:subfield code="(.)">([\s\S]*?)<\/mxc:subfield>/g
        let s: RegExpExecArray | null
        while ((s = subRe.exec(m[2]))) (sub[s[1]] ??= []).push(decode(s[2]).trim())
        fields.push({ tag: m[1], sub })
      }
      // Date (champ 100, positions 9 à 12) gardée comme champ « 100 » ; l'ark sert à la couverture.
      const ark = chunk.match(/ark:\/12148\/[a-z0-9]+/)?.[0]
      return { ark, fields }
    })
  return { total, records }
}

export const all = (r: BnfRecord, tag: string, code: string) => r.fields.filter((f) => f.tag === tag).flatMap((f) => f.sub[code] ?? [])
export const first = (r: BnfRecord, tag: string, code: string) => all(r, tag, code)[0]

/** La notice décrit-elle un livre (et non un DVD, un CD, une carte…) ? */
export function isPrintedText(r: BnfRecord): boolean {
  const kind = first(r, '200', 'b')
  return !kind || /texte imprim/i.test(kind)
}

// ---------------------------------------------------------------------------
// Type de livre et genre (HYPOTHÈSES, corrigeables par auteur ou sur la fiche)
// ---------------------------------------------------------------------------

const MANGA_PUBLISHERS = [
  'kana', 'pika', 'ki oon', 'kurokawa', 'kaze', 'tonkam', 'akata', 'doki doki', 'soleil manga', 'glenat manga',
  'panini manga', 'noeve', 'meian', 'mangetsu', 'vega', 'nobi nobi', 'kioon', 'crunchyroll', 'taifu', 'ototo',
]
const COMICS_PUBLISHERS = ['urban comics', 'panini comics', 'marvel', 'dc comics', 'delcourt comics', 'hi comics', 'semic', 'bliss comics', 'glenat comics']
const BD_PUBLISHERS = [
  'dupuis', 'dargaud', 'lombard', 'casterman', 'delcourt', 'soleil', 'bamboo', 'glenat', 'humanoides', 'futuropolis',
  'fluide glacial', 'vents d ouest', 'rue de sevres', 'grand angle', 'albert rene', 'lucky comics', 'blake et mortimer',
]

const has = (text: string, words: string[]) => words.some((w) => ` ${text} `.includes(` ${w} `))

export interface BookHints {
  publisher?: string
  collection?: string
  /** Genres BnF (champ 608), ex. « Bandes dessinées ». */
  forms: string[]
  dewey?: string
  /** Langue d'origine (traductions), ex. « jpn », « eng ». */
  originalLanguage?: string
  /** Complément du titre (« roman », « nouvelles »…). */
  complement?: string
  /** Public jeunesse signalé (« À partir de 11 ans »). */
  youth: boolean
  /** « Sens de lecture japonais ». */
  japaneseReading: boolean
  heightCm?: number
  pages?: number
  /** Sujets Open Library (en anglais). */
  subjects?: string[]
  /** Résumé de l'éditeur (champ 330) : seuls des mots sans ambiguïté y sont cherchés. */
  summary?: string
}

/** Livre, BD, manga ou comics ? */
export function guessBookKind(h: BookHints): BookKind {
  const pub = normalizeText(h.publisher ?? '')
  const forms = normalizeText(h.forms.join(' '))
  // Sujets Open Library : seulement les catégories nettes (« Comics & graphic novels, literary » désigne aussi des romans adaptés).
  const subjects = (h.subjects ?? []).map(normalizeText)
  const bdPublisher = has(pub, BD_PUBLISHERS) && ((h.heightCm ?? 0) >= 24 || (h.pages ?? 999) <= 100)
  const bd =
    forms.includes('bandes dessinees') ||
    !!h.dewey?.startsWith('741.5') ||
    subjects.some((s) => s === 'comic books strips' || s === 'graphic novels') ||
    bdPublisher
  if (h.japaneseReading || has(pub, MANGA_PUBLISHERS)) return 'manga'
  if (bd && ['jpn', 'kor', 'chi'].includes(h.originalLanguage ?? '')) return 'manga'
  if (bd && pub.includes('glenat') && (h.heightCm ?? 99) <= 19) return 'manga'
  if (has(pub, COMICS_PUBLISHERS) || (bd && h.originalLanguage === 'eng')) return 'comics'
  return bd ? 'bd' : 'livre'
}

/** Genres d'un livre (mots qui correspondent aux thèmes par défaut des livres). */
export function guessBookGenres(kind: BookKind, h: BookHints): string[] {
  if (kind === 'bd') return ['BD']
  if (kind === 'manga') return ['Manga']
  if (kind === 'comics') return ['Comics']
  const text = normalizeText([h.publisher, h.collection, h.complement, ...h.forms, ...(h.subjects ?? [])].join(' '))
  const genres: string[] = []
  if (
    h.youth ||
    /^809/.test(h.dewey ?? '') ||
    /jeunesse|junior|bibliotheque (rose|verte)|castor poche|folio cadet|livres pour enfants|juvenile|children/.test(text)
  ) {
    genres.push('Jeunesse')
  }
  const summary = normalizeText(h.summary ?? '')
  if (
    /polic|thriller|roman noir|serie noire|suspense|espionnage|detective|mystery|crime|masque/.test(text) ||
    /\b(thriller|polar|roman policier|roman noir)\b/.test(summary)
  ) {
    genres.push('Polar')
  }
  if (
    /science fiction|fantasy|fantastique|anticipation|lune d encre|presence du futur|ailleurs et demain|bragelonne|mnemos|atalante/.test(text) ||
    /\b(science fiction|sf|fantasy|space opera)\b/.test(summary)
  ) {
    genres.push('Science-fiction')
  }
  const dewey = h.dewey ?? ''
  // Une œuvre de fiction n'est ni un livre d'histoire, ni un livre pratique (même si ses sujets en parlent).
  const fiction = /^8/.test(dewey) || /\b(roman|romans|nouvelles|fiction|recit|novel|novels)\b/.test(text)
  if (!fiction) {
    if (/^79/.test(dewey)) genres.push('Loisirs')
    else if (/^6/.test(dewey) || /\b(cooking|cuisine)\b/.test(text)) genres.push('Pratique')
    else if (/^7/.test(dewey)) genres.push('Art')
    else if (/^9/.test(dewey) || /\b(history|biography)\b/.test(text)) genres.push('Histoire')
    else if (/^[0-5]/.test(dewey)) genres.push('Essai')
  }
  if (!genres.length && fiction) genres.push('Roman')
  return genres
}

/**
 * Épaisseur estimée (mm) d'après le nombre de pages. HYPOTHÈSES à mesurer sur ta bibliothèque :
 * album de BD cartonné ≈ 0,11 mm / page + 4,5 mm de couverture (48 p. ≈ 10 mm) ;
 * manga ≈ 0,065 mm / page + 1 mm (200 p. ≈ 14 mm) ; poche ≈ 0,055 mm / page + 1 mm (300 p. ≈ 18 mm) ;
 * grand format ≈ 0,07 mm / page + 3 mm (300 p. ≈ 24 mm).
 */
export function estimateBookThickness(kind: BookKind, pages?: number, heightCm?: number): number {
  const album = (kind === 'bd' || kind === 'comics') && (heightCm ?? 30) >= 24
  if (!pages) return album ? 10 : kind === 'manga' ? 14 : (heightCm ?? 20) <= 18.5 ? 15 : 25
  const mm = album
    ? pages * 0.11 + 4.5
    : kind === 'manga'
      ? pages * 0.065 + 1
      : (heightCm ?? 20) <= 18.5
        ? pages * 0.055 + 1
        : pages * 0.07 + 3
  return Math.round(mm * 10) / 10
}

/** Hauteur par défaut quand la notice ne la donne pas. */
function defaultHeight(kind: BookKind): number {
  return kind === 'bd' ? 30 : kind === 'comics' ? 26 : kind === 'manga' ? 18 : 20
}

// ---------------------------------------------------------------------------
// Notice BnF → fiche
// ---------------------------------------------------------------------------

/** « Oda » + « Eiichirō » → affiché « Eiichirō Oda », trié « Oda, Eiichirō ». */
export function person(f: MarcField): { display: string; sort: string } | null {
  const last = f.sub.a?.[0]?.trim()
  if (!last) return null
  const firstName = f.sub.b?.[0]?.trim()
  return firstName ? { display: `${firstName} ${last}`, sort: `${last}, ${firstName}` } : { display: last, sort: last }
}

/** « Albert Camus » → « Camus, Albert » (sources qui ne donnent pas le nom de tri). */
export function invertPersonName(name: string): string {
  const words = name.trim().split(/\s+/)
  if (name.includes(',') || words.length < 2) return name.trim()
  return `${words.at(-1)}, ${words.slice(0, -1).join(' ')}`
}

export const num = (text?: string) => {
  const n = text?.match(/\d+/)?.[0]
  return n ? Number(n) : undefined
}

function pagesFrom(text?: string): number | undefined {
  const all = [...(text ?? '').matchAll(/(\d+)\s*(?:p\b|pages)/g)].map((m) => Number(m[1]))
  return all.length ? Math.max(...all) : undefined
}

function heightFrom(text?: string): number | undefined {
  const m = text?.match(/(\d+(?:[.,]\d+)?)\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?cm/)
  return m ? Number(m[1].replace(',', '.')) : undefined
}

/** « [d'après Antoine de Saint-Exupéry] » → « Antoine de Saint-Exupéry ». */
export function cleanResponsibility(text: string | undefined): string | undefined {
  const name = text
    ?.replace(/[[\]]/g, '')
    .split(/\s*[;,]\s*|\s+et\s+/)[0]
    ?.replace(/^(d['’]apr[eè]s|par|texte(s)? de|r[ée]cit de|illustr[ée]e?s? par|traduit par|adapt[ée] par)\s+/i, '')
    .trim()
  return name || undefined
}

export function bookDraftFromBnf(r: BnfRecord, isbn?: string): CdDraft {
  const field = (tag: string) => r.fields.find((f) => f.tag === tag)
  // Auteurs : auteur principal (700), puis co-auteurs (701), sans les traducteurs ni préfaciers (702).
  const people = r.fields
    .filter((f) => f.tag === '700' || f.tag === '701')
    .map(person)
    .filter((p): p is { display: string; sort: string } => !!p)
  const responsibility = cleanResponsibility(first(r, '200', 'f'))
  const author = people[0] ?? (responsibility ? { display: responsibility, sort: invertPersonName(responsibility) } : null)
  const authors = people.length > 1 ? `${people[0].display} & ${people[1].display}` : (author?.display ?? 'Auteur inconnu')

  const publisher = first(r, '214', 'c') ?? first(r, '210', 'c')
  const collection = first(r, '225', 'a')
  const heightCm = heightFrom(first(r, '215', 'd'))
  const pages = pagesFrom(first(r, '215', 'a'))
  const hints: BookHints = {
    publisher,
    collection,
    forms: all(r, '608', 'a'),
    // Indice Dewey, sinon « cadre de classement » de la BnF (mêmes centaines : 803 roman, 809 jeunesse, 640 cuisine…).
    dewey: first(r, '676', 'a') ?? first(r, '686', 'a'),
    originalLanguage: first(r, '101', 'c'),
    complement: first(r, '200', 'e'),
    youth: r.fields.some((f) => f.tag === '333') || all(r, '329', '2').includes('CNLJ'),
    japaneseReading: all(r, '307', 'a').some((t) => /sens de lecture japonais/i.test(t)),
    summary: first(r, '330', 'a'),
    heightCm,
    pages,
  }
  const kind = guessBookKind(hints)

  // Série et tome : lien vers la série (461), sinon (BD) la collection numérotée, sinon le n° de partie (200 $h).
  const s461 = field('461')
  const s225 = field('225')
  const partNumber = num(first(r, '200', 'h'))
  let series = s461?.sub.t?.[0]
  let volume = num(s461?.sub.v?.[0]) ?? partNumber
  if (!series && kind !== 'livre' && s225?.sub.v?.[0] && (num(s225.sub.v[0]) ?? 999) <= 200) {
    series = s225.sub.a?.[0]
    volume = num(s225.sub.v[0])
  }
  const mainTitle = first(r, '200', 'a') ?? 'Titre inconnu'
  if (!series && partNumber && kind !== 'livre') series = mainTitle
  const partTitle = first(r, '200', 'i')
  // « One Piece » + tome 56 → « One Piece, tome 56 » (le titre seul ne dirait pas quel tome c'est).
  const sameAsSeries = !series || normalizeText(series) === normalizeText(mainTitle)
  const title = partTitle ?? (partNumber && sameAsSeries ? `${mainTitle}, tome ${partNumber}` : mainTitle)

  const year = num(first(r, '100', 'a')?.slice(9, 13)) ?? num(first(r, '214', 'd') ?? first(r, '210', 'd'))
  const ean = first(r, '073', 'a') ?? first(r, '010', 'a')?.replace(/[^\dX]/gi, '')
  const code = isbn ?? (ean && /^97[89]\d{10}$/.test(ean) ? ean : undefined)
  const genres = guessBookGenres(kind, hints)
  const hasCover = all(r, '856', 'b').some((b) => /couverture/i.test(b))
  return {
    media: 'livre',
    barcode: code,
    artist: authors,
    artistSort: author?.sort ?? 'Inconnu',
    title: title.replace(/\s+/g, ' ').trim(),
    year: year && year > 1400 && year < 2100 ? year : undefined,
    releaseYear: year,
    label: publisher,
    bookCollection: collection ? `${collection}${s225?.sub.v?.[0] ? ` n° ${s225.sub.v[0]}` : ''}` : undefined,
    genres,
    styles: hints.forms.filter((f) => !/bandes dessin/i.test(f)),
    bookKind: kind,
    // « Blacksad. » → « Blacksad » (ponctuation finale du catalogue)
    series: series?.replace(/[\s.,;:]+$/, '').trim() || undefined,
    volume,
    pages,
    heightCm: heightCm ?? defaultHeight(kind),
    format: 'autre',
    discCount: 1,
    thicknessMm: estimateBookThickness(kind, pages, heightCm),
    coverUrls: [
      ...(code ? [`https://covers.openlibrary.org/b/isbn/${code}-M.jpg?default=false`] : []),
      ...(hasCover && r.ark ? [`https://catalogue.bnf.fr/couverture?&appName=NE&idArk=${r.ark}&couverture=1`] : []),
    ],
    isCompilation: false,
    status: 'identifie',
    confidence: genres.length ? 95 : 85,
    confidenceReasons: [
      code ? 'Reconnu par la BnF (ISBN)' : 'Trouvé dans le catalogue de la BnF',
      ...(genres.length ? [] : ['Genre non trouvé : choisis-le dans Classement']),
    ],
    source: 'bnf',
    bnfArk: r.ark,
  }
}

// ---------------------------------------------------------------------------
// Open Library (secours)
// ---------------------------------------------------------------------------

interface OlBook {
  title?: string
  subtitle?: string
  authors?: { name: string }[]
  publishers?: { name: string }[]
  publish_date?: string
  number_of_pages?: number
  subjects?: { name: string }[]
  cover?: { medium?: string; large?: string }
}

export function bookDraftFromOpenLibrary(b: OlBook, isbn: string): CdDraft {
  const subjects = (b.subjects ?? []).map((s) => s.name)
  const seriesTag = subjects.find((s) => s.startsWith('series:'))
  const hints: BookHints = { publisher: b.publishers?.[0]?.name, forms: [], youth: false, japaneseReading: false, pages: b.number_of_pages, subjects }
  const kind = guessBookKind(hints)
  const genres = guessBookGenres(kind, hints)
  const authors = (b.authors ?? []).map((a) => a.name)
  return {
    media: 'livre',
    barcode: isbn,
    artist: authors.slice(0, 2).join(' & ') || 'Auteur inconnu',
    artistSort: authors[0] ? invertPersonName(authors[0]) : 'Inconnu',
    title: b.title ?? 'Titre inconnu',
    year: num(b.publish_date?.match(/\d{4}/)?.[0]),
    releaseYear: num(b.publish_date?.match(/\d{4}/)?.[0]),
    label: hints.publisher,
    genres,
    styles: subjects.filter((s) => !s.startsWith('series:')).slice(0, 5),
    bookKind: kind,
    series: seriesTag?.slice('series:'.length).replace(/_/g, ' '),
    pages: b.number_of_pages,
    heightCm: defaultHeight(kind),
    format: 'autre',
    discCount: 1,
    thicknessMm: estimateBookThickness(kind, b.number_of_pages),
    coverUrls: [b.cover?.medium, `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`].filter((u): u is string => !!u),
    isCompilation: false,
    // Open Library est moins fiable (fiches saisies par des bénévoles) : à vérifier.
    status: 'a_verifier',
    confidence: 75,
    confidenceReasons: ['Reconnu par Open Library (inconnu de la BnF) : vérifie la fiche', ...(genres.length ? [] : ['Genre non trouvé : choisis-le dans Classement'])],
    source: 'openlibrary',
  }
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

/** Interroge le catalogue de la BnF (toutes notices : livres, DVD…). */
export async function bnfRecords(query: string, max: number, priority: Priority): Promise<BnfRecord[]> {
  const params = new URLSearchParams({
    version: '1.2',
    operation: 'searchRetrieve',
    query,
    recordSchema: 'unimarcxchange',
    maximumRecords: String(max),
  })
  const xml = await throttledText(bnfThrottle, `${BNF_SRU}?${params}`, {}, priority)
  return parseSru(xml).records
}

async function bnfSearch(query: string, max: number, priority: Priority): Promise<BnfRecord[]> {
  return (await bnfRecords(query, max, priority)).filter(isPrintedText)
}

export const cql = (text: string) => `"${text.replace(/["\\]/g, ' ').trim()}"`

export interface BookIdentifyResult {
  state: 'trouve' | 'a_choisir' | 'introuvable'
  candidates: Candidate[]
}

/** Identifie un livre par son ISBN : BnF, sinon Open Library. */
export async function identifyBook(isbn: string, priority: Priority = 'normal'): Promise<BookIdentifyResult> {
  const code = canonicalBarcode(isbn)
  const short = isbn10(code)
  const query = short ? `bib.isbn adj ${cql(code)} or bib.isbn adj ${cql(short)}` : `bib.isbn adj ${cql(code)}`
  const records = await bnfSearch(query, 5, priority)
  if (records.length) {
    const candidates = records.map((r, i) => ({ key: `bnf:${r.ark ?? i}`, draft: bookDraftFromBnf(r, code), enriched: true }))
    return { state: candidates.length === 1 ? 'trouve' : 'a_choisir', candidates }
  }
  try {
    const data = await throttledJson<Record<string, OlBook>>(
      olThrottle,
      `https://openlibrary.org/api/books?bibkeys=ISBN:${code}&format=json&jscmd=data`,
      {},
      priority,
    )
    const book = Object.values(data)[0]
    if (book) return { state: 'trouve', candidates: [{ key: `ol:${code}`, draft: bookDraftFromOpenLibrary(book, code), enriched: true }] }
  } catch {
    // Open Library indisponible : le livre part « à vérifier ».
  }
  return { state: 'introuvable', candidates: [] }
}

/** Recherche un livre sans ISBN par titre (et auteur) dans le catalogue de la BnF. */
export async function searchBooks(title: string, author: string): Promise<Candidate[]> {
  const parts = [title.trim() && `bib.title all ${cql(title)}`, author.trim() && `bib.author all ${cql(author)}`].filter(Boolean)
  if (!parts.length) return []
  const records = await bnfSearch(parts.join(' and '), 30, 'high')
  const wanted = normalizeText(title)
  // Le titre exact d'abord (« Le Petit Prince » avant « Le Petit Prince pour les bébés »), puis les titres qui commencent pareil.
  const score = (t: string) => {
    const n = normalizeText(t)
    return !wanted ? 0 : n === wanted || n.endsWith(` ${wanted}`) && n.split(' ').length - wanted.split(' ').length <= 1 ? 2 : n.includes(wanted) ? 1 : 0
  }
  return records
    .map((r, i) => {
      const draft = bookDraftFromBnf(r)
      draft.confidenceReasons = ['Choisi par toi dans le catalogue de la BnF']
      return { key: `bnf:${r.ark ?? i}`, draft, enriched: true }
    })
    .map((c, i) => ({ c, i, s: score(c.draft.title) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c)
}
