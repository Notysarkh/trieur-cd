import type { Candidate, CdDraft, Platform } from '../db/types'
import { canonicalBarcode } from '../lib/barcode'
import { platformFromText, platformInfo } from '../lib/platforms'
import { normalizeText } from '../lib/text'
import type { Priority } from '../lib/throttle'
import { all, bnfRecords, cql, first, num, type BnfRecord } from './books'
import { bestRawgMatch, hasRawgKey, searchRawg, type RawgResult } from './rawg'

// Jeux vidéo (v2, étape D).
//
// 1. Code-barres → catalogue de la BnF (dépôt légal des jeux vidéo depuis 1992) : titre, console, éditeur,
//    année, genre (« jeu d'arcade ou d'action »…). Mesuré le 15/11/2026 sur 150 notices par console :
//    93 à 99 % ont un code-barres, la console est écrite dans 95 à 99 % des cas.
//    Les jeux très récents n'ont souvent qu'une « pré-notice » (titre, éditeur, sans la console) :
//    la console choisie sur l'écran Scanner sert alors.
// 2. Avec une clé RAWG (facultative) : image du jeu, année de sortie d'origine, genres ;
//    et recherche par titre pour les jeux que la BnF ne connaît pas.

/** Épaisseur et hauteur par défaut d'un jeu (boîtier standard de sa console). */
export function gameSize(platform: Platform | undefined, discCount = 1): { thicknessMm: number; heightCm: number } {
  const p = platformInfo(platform) ?? platformInfo('autre')!
  // Jeux PS1 sur plusieurs CD : boîtier double épais.
  const thicknessMm = platform === 'ps1' && discCount >= 2 ? 24 : p.thicknessMm
  return { thicknessMm, heightCm: p.heightCm }
}

/**
 * Les écritures possibles d'un code-barres dans le catalogue de la BnF, qui le garde tel qu'il a été saisi :
 * « 045496420246 » (12 chiffres), « 45496333133 » (sans les zéros du début) ou les 13 chiffres.
 */
export function bnfEanVariants(raw: string): string[] {
  const code = canonicalBarcode(raw)
  const stripped = code.replace(/^0+/, '')
  return [...new Set([code, stripped, `0${stripped}`, `00${stripped}`])].filter((v) => v.length >= 11 && v.length <= 13)
}

/** Mentions de la BnF qui ne disent rien du genre du jeu. */
const NOISE = /^(?:(?:jeu|jeu video|edition commerciale|jeunesse|adulte|adolescence|enfance|adaptation|non fiction|multimedia|telechargement|scenario original)$|oeuvre d origine)/

/** Genres d'un jeu d'après la BnF (« jeu d'arcade ou d'action »…), sans les mentions générales. */
export function gameGenres(forms: string[]): string[] {
  return forms.filter((f) => !NOISE.test(normalizeText(f)))
}

/** La notice décrit-elle un jeu (et non un livre, un DVD, un CD) ? */
export function isGame(r: BnfRecord): boolean {
  const kind = first(r, '200', 'b') ?? ''
  const physical = all(r, '215', 'a').join(' ')
  if (/texte imprim|images anim|enregistrement sonore|musique/i.test(kind)) return false
  if (/DVD vid|BD vid|\bvol\.|\bp\.\)/i.test(physical)) return false
  return /ressource [ée]lectronique/i.test(kind) || /cartouche|disque optique|\bUMD\b|carte de jeu|code de t[ée]l[ée]chargement/i.test(physical)
}

/** « [Nintendo co. Ltd] », « NINTENDO FRANCE », « Nintendo France [diff.] » → nom propre de l'éditeur. */
export function cleanPublisher(text: string | undefined): string | undefined {
  const name = text
    ?.replace(/\[(diff|distrib|prod|[ée]d)\.?\]/gi, '')
    .replace(/[[\]]/g, '')
    .trim()
  if (!name) return undefined
  // Pré-notices en capitales : « NINTENDO FRANCE » → « Nintendo France ».
  return name === name.toUpperCase() ? name.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase()) : name
}

/**
 * Fiche d'un jeu à partir d'une notice BnF.
 * `fallbackPlatform` : la console choisie sur l'écran Scanner, si la notice ne l'indique pas.
 */
export function gameDraftFromBnf(r: BnfRecord, ean?: string, fallbackPlatform?: Platform): CdDraft {
  const t200 = r.fields.find((f) => f.tag === '200')
  const main = t200?.sub.a?.[0] ?? 'Titre inconnu'
  const parts = [...(t200?.sub.e ?? []), ...(t200?.sub.i ?? [])]
  const title = [main, ...parts].join(' : ').replace(/\s+/g, ' ').trim()
  const physical = all(r, '215', 'a').join(' ')
  const found = platformFromText(physical) ?? platformFromText(all(r, '300', 'a').join(' '))
  const platform = found ?? fallbackPlatform
  const discs = num(physical.match(/(\d+)\s*(disques?|cartouches?)/i)?.[1]) ?? 1
  // Éditeur : rôle 650 (éditeur commercial), sinon la mention d'édition (214 / 210).
  const publisherField = r.fields.find((f) => /^71[012]$/.test(f.tag) && f.sub['4']?.[0] === '650')
  const publisher = cleanPublisher(publisherField?.sub.a?.[0] ?? first(r, '214', 'c') ?? first(r, '210', 'c'))
  const year = num(first(r, '100', 'a')?.slice(9, 13))
  const code = ean ?? first(r, '073', 'a')
  const genres = gameGenres(all(r, '608', 'a'))
  const reasons = [code ? 'Reconnu par la BnF (code-barres)' : 'Trouvé dans le catalogue de la BnF']
  if (!found && platform) reasons.push('Console choisie par toi (la BnF ne l’indique pas)')
  if (!platform) reasons.push('Console inconnue : choisis-la sur la fiche')
  return {
    media: 'jeu',
    barcode: code ? canonicalBarcode(code) : undefined,
    artist: publisher ?? 'Éditeur inconnu',
    artistSort: publisher ?? 'Inconnu',
    title,
    year,
    releaseYear: year,
    label: publisher,
    genres,
    styles: [],
    platform,
    format: 'autre',
    discCount: discs,
    ...gameSize(platform, discs),
    coverUrls: [],
    isCompilation: false,
    status: 'identifie',
    confidence: found ? 95 : platform ? 85 : 70,
    confidenceReasons: reasons,
    source: 'bnf',
    bnfArk: r.ark,
  }
}

export interface GameIdentifyResult {
  state: 'trouve' | 'a_choisir' | 'introuvable'
  candidates: Candidate[]
}

/** Identifie un jeu par son code-barres dans le catalogue de la BnF. */
export async function identifyGame(ean: string, fallbackPlatform?: Platform, priority: Priority = 'normal'): Promise<GameIdentifyResult> {
  const code = canonicalBarcode(ean)
  const query = bnfEanVariants(code).map((v) => `bib.ean adj ${cql(v)}`).join(' or ')
  const records = (await bnfRecords(query, 5, priority)).filter(isGame)
  if (!records.length) return { state: 'introuvable', candidates: [] }
  const candidates = records.map((r, i) => ({ key: `bnf:${r.ark ?? i}`, draft: gameDraftFromBnf(r, code, fallbackPlatform), enriched: !hasRawgKey() }))
  // Une notice complète (avec la console) est préférée à une pré-notice qui porte le même code.
  const complete = candidates.filter((c) => c.draft.confidence >= 95)
  const list = complete.length ? complete : candidates
  return { state: list.length === 1 ? 'trouve' : 'a_choisir', candidates: list }
}

/** Fiche à partir d'un résultat RAWG (recherche par titre), pour une console donnée. */
export function gameDraftFromRawg(g: RawgResult, platform?: Platform): CdDraft {
  const p = platform ?? (g.platforms.length === 1 ? g.platforms[0] : undefined)
  return {
    media: 'jeu',
    artist: 'Éditeur inconnu',
    artistSort: 'Inconnu',
    title: g.title,
    year: g.year,
    releaseYear: g.year,
    genres: g.genres,
    styles: [],
    platform: p,
    format: 'autre',
    discCount: 1,
    ...gameSize(p, 1),
    coverUrls: g.imageUrl ? [g.imageUrl] : [],
    isCompilation: false,
    status: 'identifie',
    confidence: p ? 85 : 70,
    confidenceReasons: ['Choisi par toi (RAWG)', ...(p ? [] : ['Console à choisir sur la fiche'])],
    source: 'rawg',
    rawgId: g.id,
  }
}

/** Complète une fiche de jeu avec RAWG (si une clé est configurée) : image, année d'origine, genres. */
export async function enrichGame(draft: CdDraft, priority: Priority = 'normal'): Promise<CdDraft> {
  if (!hasRawgKey() || draft.rawgId) return draft
  // RAWG injoignable ou clé refusée : on garde simplement la fiche de la BnF.
  const results = await searchRawg(draft.title, draft.platform, priority).catch(() => [])
  const match = bestRawgMatch(results, draft.title)
  if (!match) return draft
  const d: CdDraft = { ...draft, rawgId: match.id }
  if (match.year) d.year = match.year
  if (!d.genres.length) d.genres = match.genres
  if (match.imageUrl) d.coverUrls = [...d.coverUrls, match.imageUrl]
  if (!d.platform && match.platforms.length === 1) {
    d.platform = match.platforms[0]
    Object.assign(d, gameSize(d.platform, d.discCount))
  }
  return d
}

/**
 * Recherche un jeu par son titre (et sa console, si tu la choisis) : RAWG (si clé) puis le catalogue de la BnF.
 */
export async function searchGames(title: string, platform?: Platform): Promise<Candidate[]> {
  if (!title.trim()) return []
  // Seulement les jeux (« Ressource électronique ») : sinon les livres et guides passent devant.
  // Les pré-notices des jeux récents n'ont pas cette mention : elles se trouvent par le code-barres.
  const info = platform && platform !== 'autre' ? platformInfo(platform) : undefined
  const words = info ? ` and bib.anywhere all ${cql(info.bnfWords ?? info.label)}` : ''
  const bnfQuery = `bib.title all ${cql(title)} and bib.anywhere all "Ressource électronique"${words}`
  const [rawg, bnf] = await Promise.allSettled([
    searchRawg(title, platform, 'high'),
    bnfRecords(bnfQuery, 40, 'high').then((rs) => rs.filter(isGame)),
  ])
  const fromRawg = rawg.status === 'fulfilled' ? rawg.value.map((g) => ({ key: `rawg:${g.id}`, draft: gameDraftFromRawg(g, platform), enriched: true })) : []
  const fromBnf =
    bnf.status === 'fulfilled'
      ? bnf.value
          .map((r, i) => {
            const draft = gameDraftFromBnf(r, undefined, platform)
            draft.confidenceReasons = ['Choisi par toi dans le catalogue de la BnF']
            return { key: `bnf:${r.ark ?? i}`, draft, enriched: !hasRawgKey() }
          })
          // Console choisie : seulement les jeux de cette console (ou dont la console est inconnue).
          .filter((c) => !platform || c.draft.platform === platform)
      : []
  if (rawg.status === 'rejected' && bnf.status === 'rejected') throw new Error('Ni RAWG ni la BnF ne répondent pour le moment.')
  return [...fromRawg, ...fromBnf]
}
