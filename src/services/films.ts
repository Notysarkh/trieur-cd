import type { Candidate, CdDraft, VideoFormat } from '../db/types'
import { canonicalBarcode } from '../lib/barcode'
import { normalizeText } from '../lib/text'
import type { Priority } from '../lib/throttle'
import { all, bnfRecords, cleanResponsibility, cql, first, invertPersonName, num, person, type BnfRecord } from './books'
import { bestTmdbMatch, hasTmdbKey, sagaName, searchTmdb, searchTmdbSaga, tmdbDirector, tmdbMovieDetails, tmdbSagaOfMovie, type TmdbResult } from './tmdb'
import { hasOmdbKey, omdbScores } from './omdb'

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

/** Mots qui signalent un coffret dans le titre (« l'intégrale », « trilogie », « années 1-5 », « 5 films »…). */
const BOX_WORDS = /coffret|int[ée]grale|trilogie|t[ée]tralogie|quadrilogie|hexalogie|\bsaga\b|\bcollection\b|ann[ée]es\s*\d+\s*(?:[-–à]|a)\s*\d+|\b\d+\s*films\b/i

/**
 * Les films d'un coffret d'après la note de contenu de la BnF (champ 327, ex. « Harry Potter et la coupe de feu /
 * Mike Newell, réal »). Moins de 2 titres : pas une vraie liste (souvent le titre du coffret lui-même).
 */
export function boxContents(r: BnfRecord): string[] {
  const items = all(r, '327', 'a')
    .map((s) => s.replace(/\s+\/.*$/, '').replace(/[\s.,;:]+$/, '').trim())
    .filter(Boolean)
  const unique = [...new Set(items)]
  return unique.length >= 2 ? unique : []
}

/** Nom de la saga d'un coffret, sans « l'intégrale », « coffret »… (« Les Tuche, l'intégrale 5 films » → « Les Tuche »). */
export function sagaFromBoxTitle(title: string): string {
  return title
    .replace(/\s*[,:\-–]?\s*(?:(?:le|la|l['’])\s*)?(?:coffret|int[ée]grale|trilogie|t[ée]tralogie|quadrilogie|hexalogie|saga|collection)\b.*$/i, '')
    .replace(/[\s.,;:\-–]+$/, '')
    .trim()
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
  // Coffret : liste des films (BnF), ou titre de coffret sur plusieurs disques (une saison seule n'en est pas un).
  const contents = boxContents(r)
  const subtitles = all(r, '200', 'e').filter((e) => !/^[ée]dition/i.test(e))
  const boxText = [mainTitle, ...subtitles, ...all(r, '073', 'b')].join(' ')
  // Une seule saison (« l'intégrale de la saison 1 ») n'est pas un coffret.
  const tvSeason =
    (genres.includes('Série TV') && !/saisons|de la s[ée]rie|coffret/i.test(boxText)) ||
    (/\bsaison\s*\d+\b/i.test(boxText) && !/saisons/i.test(boxText))
  const boxSet = contents.length >= 2 || (discCount >= 2 && !tvSeason && BOX_WORDS.test(boxText))
  const baseTitle = partTitle ? `${mainTitle} — ${partTitle}` : partNumber ? `${mainTitle}, saison ${partNumber}` : mainTitle
  const title = boxSet && subtitles.length ? `${baseTitle} : ${subtitles.join(' : ')}` : baseTitle
  // La saga d'un coffret : celle de la BnF, sinon le titre sans « l'intégrale »… (pour le ranger avec les films de la saga).
  const saga = series ?? (boxSet && !genres.includes('Série TV') ? sagaFromBoxTitle(mainTitle) || undefined : undefined)
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
    series: saga?.replace(/[\s.,;:]+$/, '').trim() || undefined,
    volume: series ? volume : undefined,
    ...(boxSet ? { boxSet: true, contents } : {}),
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
  const d = hasTmdbKey() ? await enrichWithTmdb(draft, priority) : { ...draft }
  return d.boxSet ? d : withOmdbScores(d, priority)
}

/**
 * Notes Metacritic, IMDb et Rotten Tomatoes (OMDb, si une clé est configurée) : par l'identifiant IMDb
 * donné par TMDB, sinon par le titre et l'année.
 */
export async function withOmdbScores(draft: CdDraft, priority: Priority = 'normal'): Promise<CdDraft> {
  if (!hasOmdbKey()) return draft
  const d: CdDraft = { ...draft }
  if (!d.imdbId && d.tmdbId?.startsWith('movie:') && hasTmdbKey()) {
    const details = await tmdbMovieDetails(Number(d.tmdbId.split(':')[1]), priority).catch(() => undefined)
    if (details?.imdb_id) d.imdbId = details.imdb_id
  }
  const s = await omdbScores(d.imdbId ? { imdbId: d.imdbId } : { title: d.title, year: d.year }, priority).catch(() => undefined)
  d.scoresAt = Date.now()
  if (!s) return d
  if (s.imdbId) d.imdbId = s.imdbId
  d.scores = { ...d.scores, metacritic: s.metacritic, imdb: s.imdb, rottenTomatoes: s.rottenTomatoes }
  return d
}

async function enrichWithTmdb(draft: CdDraft, priority: Priority): Promise<CdDraft> {
  const d: CdDraft = { ...draft }
  if (d.boxSet) return enrichBoxSet(d, priority)
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
  // Saga (Harry Potter, Star Wars…) : le film sera rangé avec les autres films de la saga, à son numéro.
  if (match?.kind === 'movie' && !d.series) {
    const saga = await tmdbSagaOfMovie(match.id, priority).catch(() => undefined)
    const n = saga ? saga.parts.findIndex((p) => p.id === match.id) : -1
    if (saga && n >= 0 && saga.parts.length >= 2) {
      d.series = sagaName(saga.name)
      d.volume = n + 1
    }
  }
  return d
}

/**
 * Coffret : la liste de ses films d'après la saga TMDB du même nom (si la BnF ne la donne pas),
 * l'affiche de la saga et ses genres s'il en manque. HYPOTHÈSE : la saga trouvée est la bonne (à vérifier sur la fiche).
 */
async function enrichBoxSet(d: CdDraft, priority: Priority): Promise<CdDraft> {
  const name = d.series ?? sagaFromBoxTitle(d.title.replace(/\s*:.*$/, ''))
  const saga = await searchTmdbSaga(name, priority).catch(() => undefined)
  if (!saga) return d
  d.series ??= sagaName(saga.name)
  if (!d.contents?.length) {
    d.contents = saga.parts.map((p) => p.title)
    d.confidenceReasons = [...d.confidenceReasons, `Films du coffret d'après la saga TMDB « ${saga.name} » : à vérifier`]
  }
  if (!d.genres.length) d.genres = saga.parts.find((p) => p.genres.length)?.genres ?? []
  if (saga.posterUrl) d.coverUrls = [saga.posterUrl, ...d.coverUrls]
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
