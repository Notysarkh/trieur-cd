import type { Candidate, CdDraft, VideoFormat } from '../db/types'
import { canonicalBarcode } from '../lib/barcode'
import { normalizeText } from '../lib/text'
import type { Priority } from '../lib/throttle'
import { all, bnfRecords, cleanResponsibility, cql, first, invertPersonName, num, person, type BnfRecord } from './books'
import { bestTmdbMatch, hasTmdbKey, searchTmdb, tmdbDirector, type TmdbResult } from './tmdb'

// Films : DVD, Blu-ray, HD DVD, VHS, LaserDisc… (v2, étape C).
//
// 1. Code-barres → catalogue de la BnF (dépôt légal des vidéos éditées en France) : titre, réalisateur,
//    éditeur, DVD ou Blu-ray (« BD vidéo »), nombre de disques, genre (« film policier, thriller »…).
//    Mesuré le 14/11/2026 sur 193 DVD / Blu-ray de grands éditeurs : 81 % ont un genre, 87 % un réalisateur.
// 2. Avec une clé TMDB (facultative) : affiche, année de sortie du film, genres manquants ;
//    et recherche par titre pour les films que la BnF ne connaît pas.

// Supports et dimensions : voir lib/videoFormats.ts.
import { videoSize } from '../lib/videoFormats'
export { VIDEO_FORMAT_LABELS, videoSize } from '../lib/videoFormats'

/**
 * Support et nombre de disques (ou de cassettes), d'après la description physique BnF
 * (« 2 DVD vidéo… », « 5 BD vidéo », « 1 vidéocassette (VHS) », « 1 vidéodisque »…).
 */
export function videoFormatFrom(physical: string | undefined): { format: VideoFormat; discCount: number } {
  const p = physical ?? ''
  const format: VideoFormat = /hd[\s-]?dvd/i.test(p)
    ? 'hddvd'
    : /4k|uhd|ultra hd/i.test(p)
      ? 'uhd'
      : /\bBD vid|blu[- ]?ray/i.test(p)
        ? 'bluray'
        : /betamax|\bbeta\b/i.test(p)
          ? 'betamax'
          : /vid[ée]ocassette|\bVHS\b/i.test(p)
            ? 'vhs'
            : /laser\s?dis[ck]|vid[ée]odisque/i.test(p)
              ? 'laserdisc'
              : /cl[ée]\s+USB|\bUSB\b/i.test(p)
                ? 'usb'
                : 'dvd'
  const n = p.match(/(\d+)\s*(?:DVD|BD|HD[\s-]?DVD|disques?|vid[ée]ocassettes?|cassettes?|vid[ée]odisques?|laser\s?dis[ck]s?)/i)?.[1]
  return { format, discCount: n ? Number(n) : 1 }
}

/** Mentions de la BnF qui ne disent rien du genre du film. */
const NOISE = /^(fiction|adaptation|edition video commerciale|document d origine|oeuvre d origine|presence d un public|associatif|enregistrement evenement)/

/**
 * Genres d'un film d'après la BnF (champ 608). Une série télévisée → « Série TV ».
 * HYPOTHÈSE : « diffusé à la télévision » sur un seul disque = un film ou téléfilm (pas une série) ;
 * sur 2 disques ou plus = une saison de série.
 */
export function filmGenres(forms: string[], discCount = 1): string[] {
  const n = forms.map(normalizeText)
  const tv = n.some((f) => /diffusion a la television/.test(f))
  if (n.some((f) => f === 'serie' || /serie televisee/.test(f)) || (tv && discCount >= 2)) return ['Série TV']
  return forms.filter((f) => !NOISE.test(normalizeText(f)))
}

export function filmDraftFromBnf(r: BnfRecord, ean?: string): CdDraft {
  // Réalisateur : rôle 300 ; sinon auteur (070) ; sinon la mention de responsabilité du titre.
  const people = r.fields.filter((f) => /^70[012]$/.test(f.tag))
  const director = people.find((f) => f.sub['4']?.[0] === '300') ?? people.find((f) => f.sub['4']?.[0] === '070')
  const directorName = director ? person(director) : null
  const resp = cleanResponsibility(first(r, '200', 'f')?.replace(/,?\s*(réal|aut|sc[ée]nario).*$/i, ''))
  const name = directorName ?? (resp ? { display: resp, sort: invertPersonName(resp) } : null)

  const { format, discCount } = videoFormatFrom(first(r, '215', 'a'))
  const forms = all(r, '608', 'a')
  const genres = filmGenres(forms, discCount)
  const mainTitle = first(r, '200', 'a') ?? 'Titre inconnu'
  const partTitle = first(r, '200', 'i')
  const partNumber = num(first(r, '200', 'h'))
  const s461 = r.fields.find((f) => f.tag === '461')
  const series = s461?.sub.t?.[0] ?? (genres.includes('Série TV') || partNumber ? mainTitle : undefined)
  const volume = num(s461?.sub.v?.[0]) ?? partNumber
  const title = partTitle ? `${mainTitle} — ${partTitle}` : partNumber ? `${mainTitle}, saison ${partNumber}` : mainTitle
  const year = num(first(r, '100', 'a')?.slice(9, 13))
  const code = ean ?? first(r, '073', 'a')
  const hasCover = all(r, '856', 'b').some((b) => /couverture|jaquette/i.test(b))
  return {
    media: 'video',
    barcode: code ? canonicalBarcode(code) : undefined,
    artist: name?.display ?? 'Réalisateur inconnu',
    artistSort: name?.sort ?? 'Inconnu',
    title: title.replace(/\s+/g, ' ').trim(),
    year,
    releaseYear: year,
    label: (first(r, '214', 'c') ?? first(r, '210', 'c'))?.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/[[\]]/g, '').trim(),
    genres,
    styles: [],
    videoFormat: format,
    series: series?.replace(/[\s.,;:]+$/, '').trim() || undefined,
    volume: series ? volume : undefined,
    format: 'autre',
    discCount,
    ...videoSize(format, discCount),
    coverUrls: hasCover && r.ark ? [`https://catalogue.bnf.fr/couverture?&appName=NE&idArk=${r.ark}&couverture=1`] : [],
    isCompilation: false,
    status: 'identifie',
    confidence: genres.length ? 95 : 85,
    confidenceReasons: [
      code ? 'Reconnu par la BnF (code-barres)' : 'Trouvé dans le catalogue de la BnF',
      ...(genres.length ? [] : ['Genre non trouvé : choisis-le dans Classement (ou ajoute ta clé TMDB)']),
    ],
    source: 'bnf',
    bnfArk: r.ark,
  }
}

/** La notice décrit-elle une vidéo (et non un livre ou un CD) ? */
function isVideo(r: BnfRecord): boolean {
  // Un jeu (« Ressource électronique ») sur DVD-ROM ou Blu-ray n'est pas un film.
  if (/ressource [ée]lectronique/i.test(first(r, '200', 'b') ?? '')) return false
  return /images anim/i.test(first(r, '200', 'b') ?? '') || /DVD|BD vid|blu/i.test(first(r, '215', 'a') ?? '')
}

export interface FilmIdentifyResult {
  state: 'trouve' | 'a_choisir' | 'introuvable'
  candidates: Candidate[]
}

/** Identifie un DVD / Blu-ray par son code-barres dans le catalogue de la BnF. */
export async function identifyFilm(ean: string, priority: Priority = 'normal'): Promise<FilmIdentifyResult> {
  const code = canonicalBarcode(ean)
  const records = (await bnfRecords(`bib.ean adj ${cql(code)}`, 5, priority)).filter(isVideo)
  if (!records.length) return { state: 'introuvable', candidates: [] }
  // Les détails TMDB (affiche, année du film) sont ajoutés ensuite, pour la proposition retenue seulement.
  const candidates = records.map((r, i) => ({ key: `bnf:${r.ark ?? i}`, draft: filmDraftFromBnf(r, code), enriched: !hasTmdbKey() }))
  return { state: candidates.length === 1 ? 'trouve' : 'a_choisir', candidates }
}

/** Fiche à partir d'un résultat TMDB (recherche par titre). */
export function filmDraftFromTmdb(t: TmdbResult): CdDraft {
  const tv = t.kind === 'tv'
  return {
    media: 'video',
    artist: 'Réalisateur inconnu',
    artistSort: 'Inconnu',
    title: t.title,
    year: t.year,
    genres: t.genres,
    styles: [],
    videoFormat: 'dvd',
    series: tv ? t.title : undefined,
    format: 'autre',
    discCount: 1,
    ...videoSize('dvd', 1),
    coverUrls: t.posterUrl ? [t.posterUrl] : [],
    isCompilation: false,
    status: 'identifie',
    confidence: 85,
    confidenceReasons: ['Choisi par toi (TMDB)'],
    source: 'manuel',
    tmdbId: `${t.kind}:${t.id}`,
  }
}

/**
 * Complète une fiche de film avec TMDB (si une clé est configurée) : année de sortie du film,
 * affiche, genres si la BnF n'en donne pas, réalisateur s'il manque.
 */
export async function enrichFilm(draft: CdDraft, priority: Priority = 'normal'): Promise<CdDraft> {
  if (!hasTmdbKey()) return draft
  const d: CdDraft = { ...draft }
  let match: TmdbResult | undefined
  if (d.tmdbId) {
    const [kind, id] = d.tmdbId.split(':')
    match = { id: Number(id), kind: kind as 'movie' | 'tv', title: d.title, genres: [] }
  } else {
    const query = d.series ?? d.title.replace(/[—:,].*$/, '').trim()
    match = bestTmdbMatch(await searchTmdb(query, priority), query)
    if (match) {
      d.tmdbId = `${match.kind}:${match.id}`
      if (match.year) d.year = match.year
      if (!d.genres.length) d.genres = match.genres
      if (match.posterUrl) d.coverUrls = [match.posterUrl, ...d.coverUrls]
    }
  }
  if (match && (d.artist === 'Réalisateur inconnu' || !d.artist)) {
    const director = await tmdbDirector(match, priority).catch(() => undefined)
    if (director) {
      d.artist = director
      d.artistSort = invertPersonName(director)
    }
  }
  return d
}

/** Recherche un film par son titre : TMDB (si clé) puis le catalogue vidéo de la BnF. */
export async function searchFilms(title: string): Promise<Candidate[]> {
  if (!title.trim()) return []
  const [tmdb, bnf] = await Promise.allSettled([
    searchTmdb(title),
    bnfRecords(`bib.title all ${cql(title)}`, 30, 'high').then((rs) => rs.filter(isVideo)),
  ])
  const fromTmdb = tmdb.status === 'fulfilled' ? tmdb.value.map((t) => ({ key: `tmdb:${t.kind}:${t.id}`, draft: filmDraftFromTmdb(t), enriched: false })) : []
  const fromBnf =
    bnf.status === 'fulfilled'
      ? bnf.value.map((r, i) => {
          const draft = filmDraftFromBnf(r)
          draft.confidenceReasons = ['Choisi par toi dans le catalogue de la BnF']
          return { key: `bnf:${r.ark ?? i}`, draft, enriched: !hasTmdbKey() }
        })
      : []
  if (tmdb.status === 'rejected' && bnf.status === 'rejected') throw new Error('Ni TMDB ni la BnF ne répondent pour le moment.')
  return [...fromTmdb, ...fromBnf]
}
