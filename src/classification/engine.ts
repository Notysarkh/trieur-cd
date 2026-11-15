import type { ArtistInfo, Cd } from '../db/types'
import { cleanTags } from '../lib/cleanup'
import { normalizeText } from '../lib/text'
import { UNCLASSIFIED, type ClassificationRules, type ThemeDef } from './themes'
import { mediaOf } from '../lib/media'
import { platformLabel } from '../lib/platforms'

// Le moteur de classement. Il ne modifie rien : il calcule un « plan » que tu valides ensuite.
//
// Étapes :
// 1. on regroupe les CD par artiste (une compilation multi-artistes = un groupe à elle seule) ;
// 2. chaque CD « vote » pour un ou plusieurs thèmes d'après ses genres et styles ;
//    l'artiste va dans le thème qui a le plus de voix → un artiste n'est JAMAIS réparti sur deux thèmes ;
// 3. les règles s'appliquent : artistes forcés, musique française ;
// 4. les thèmes trop petits (ou en surnombre) sont regroupés dans leur thème parent ;
// 5. on trie : thèmes dans l'ordre choisi, puis artistes (A → Z), puis albums (du plus ancien au plus récent).

export interface PlanArtist {
  /** Clé de l'artiste (ou « cd:<id> » pour une compilation). */
  key: string
  name: string
  sortName: string
  /** Ses CD, du plus ancien au plus récent. */
  cds: Cd[]
  /** Thème final (après regroupements). */
  themeId: string
  /** Thème choisi avant les regroupements automatiques. */
  initialThemeId: string
  /** Pourquoi ce thème, en clair. */
  reason: string
  forced: boolean
  /** Part des voix obtenues par le thème retenu (1 = tous ses CD sont d'accord). */
  agreement: number
  /** Les autres thèmes possibles et leur part des voix. */
  alternatives: { themeId: string; share: number }[]
  isCompilation: boolean
  /** Compilation personnelle (CD gravé…) : rangée à la fin de son thème. */
  personal: boolean
  /** Livres en série : nom de la série pour le tri (thèmes BD, mangas, comics). */
  seriesSort?: string
}

export interface PlanTheme {
  theme: ThemeDef
  /** Artistes du thème, de A à Z. */
  artists: PlanArtist[]
  /** Les CD du thème dans l'ordre de rangement. */
  cds: Cd[]
}

export interface PlanMerge {
  from: ThemeDef
  into: ThemeDef
  count: number
  reason: string
}

export interface Plan {
  themes: PlanTheme[]
  /** Artistes sans genre connu, à classer à la main. */
  unclassified: PlanArtist[]
  /** Artistes partagés entre plusieurs thèmes (à arbitrer si tu le souhaites). */
  disputed: PlanArtist[]
  merges: PlanMerge[]
  /** Pour chaque CD : son thème et son rang dans l'ordre de rangement global. */
  placement: Map<string, { themeId: string; shelfOrder: number }>
  cdCount: number
  durationMs: number
}

/** Pseudo-thème regroupant les artistes dont on ignore le genre. */
export const UNCLASSIFIED_THEME: ThemeDef = {
  id: UNCLASSIFIED,
  name: 'À classer',
  color: '#9aa0a6',
  keywords: [],
  sortBy: 'artiste',
}

/** En dessous de cette part des voix, l'artiste est signalé « à arbitrer ». */
export const DISPUTE_THRESHOLD = 0.6

// Thèmes dans lesquels la règle « musique française » ne s'applique pas.
const NO_FRENCH: ReadonlySet<string | undefined> = new Set(['classique', 'bo', 'enfants', 'compilations', 'divers'])

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })

/**
 * Ordre chronologique : année de première sortie de l'album (à défaut, celle de l'édition), puis titre
 * par ordre alphabétique. Les CD sans aucune année vont à la fin.
 */
function byYear(a: Cd, b: Cd): number {
  const year = (cd: Cd) => cd.year ?? cd.releaseYear ?? 9999
  return year(a) - year(b) || collator.compare(titleSortKey(a.title), titleSortKey(b.title))
}

// ---------------------------------------------------------------------------
// Clé d'artiste
// ---------------------------------------------------------------------------

const ARTICLES = new Set(['the', 'les', 'le', 'la', 'l', 'a', 'an'])

/**
 * Clé qui identifie un artiste quelle que soit l'écriture de son nom :
 * « The Beatles » = « Beatles, The » ; « Georges Brassens » = « Brassens, Georges » ;
 * « Daft Punk feat. Pharrell Williams » = « Daft Punk ».
 */
export function artistKey(name: string): string {
  const main = name.replace(/\s+(feat\.?|featuring|ft\.)\s.*$/i, '')
  const words = normalizeText(main)
    .split(' ')
    .filter((w) => w && !ARTICLES.has(w))
  return words.sort().join(' ') || normalizeText(name)
}

/**
 * Groupe d'un CD pour le classement : une compilation (du commerce ou perso) est seule ;
 * sinon l'artiste, reconnu par son NOM DE TRI. Le nom de tri vient de l'artiste principal
 * (MusicBrainz), il est donc le même pour « Ben Harper » et « Ben Harper and The Blind Boys of Alabama »,
 * ou pour « 植松伸夫 » et « Nobuo Uematsu » : les collaborations sont rangées avec l'artiste principal.
 */
export function groupKeyOf(cd: Cd): string {
  if (cd.personalCompilation) return `perso:${cd.id}`
  if (cd.isCompilation) return `cd:${cd.id}`
  // Livres : tous les tomes d'une série ensemble, même si les auteurs changent. Films : les saisons d'une série TV.
  if (cd.series?.trim() && (mediaOf(cd) === 'livre' || mediaOf(cd) === 'video')) {
    return `serie:${normalizeText(seriesSortKey(cd.series))}`
  }
  // Un film seul (ou un jeu) est rangé à son titre, comme une compilation : un groupe à lui seul.
  if (mediaOf(cd) === 'video' || mediaOf(cd) === 'jeu') return `cd:${cd.id}`
  return artistKey(cd.artistSort?.trim() || cd.artist)
}

/**
 * Nom de série pour le tri : sans article initial, ni la partie « hors tri » marquée par la BnF
 * (« \u0088Une \u0089aventure d'Astérix » → « aventure d'Astérix »).
 */
export function seriesSortKey(series: string): string {
  return titleSortKey(series.replace(/\u0088[^\u0089]*\u0089/g, '').replace(/[\u0088\u0089]/g, ''))
}

/** Nom de série à afficher (sans les marques « hors tri » de la BnF). */
export function seriesLabel(series: string): string {
  return series.replace(/[\u0088\u0089]/g, '').trim()
}

/** Dans un groupe : les tomes dans l'ordre, puis l'ordre chronologique. */
function byVolume(a: Cd, b: Cd): number {
  return (a.volume ?? Infinity) - (b.volume ?? Infinity) || byYear(a, b)
}

/** Titre sans article initial, pour le tri par titre (« The Godfather » → « Godfather »). */
export function titleSortKey(title: string): string {
  // L'article doit être un mot entier : « Amélie » ou « Aventure » gardent leur A.
  return title.replace(/^(?:(?:the|a|an|le|la|les)\s+|l['’]\s*)/i, '').trim()
}

// ---------------------------------------------------------------------------
// Genres → thèmes
// ---------------------------------------------------------------------------

interface Matcher {
  exact: Map<string, string[]>
  all: { keyword: string; themeId: string }[]
}

function buildMatcher(rules: ClassificationRules): Matcher {
  const exact = new Map<string, string[]>()
  const all: Matcher['all'] = []
  for (const theme of rules.themes) {
    if (theme.special === 'francaise' && !rules.frenchTheme) continue
    for (const raw of theme.keywords) {
      const keyword = normalizeText(raw)
      if (!keyword) continue
      exact.set(keyword, [...new Set([...(exact.get(keyword) ?? []), theme.id])])
      all.push({ keyword, themeId: theme.id })
    }
  }
  return { exact, all }
}

/** Les thèmes correspondant à un genre/style (voir l'explication dans themes.ts). */
export function themesForTag(tag: string, matcher: Matcher): string[] {
  const t = normalizeText(tag)
  if (!t) return []
  const exact = matcher.exact.get(t)
  if (exact) return exact
  const padded = ` ${t} `
  let bestLength = 0
  let ids: string[] = []
  for (const { keyword, themeId } of matcher.all) {
    if (!padded.includes(` ${keyword} `)) continue
    if (keyword.length > bestLength) {
      bestLength = keyword.length
      ids = [themeId]
    } else if (keyword.length === bestLength && !ids.includes(themeId)) {
      ids.push(themeId)
    }
  }
  return ids
}

type Votes = Map<string, number>

function addTags(votes: Votes, tags: string[], weight: number, matcher: Matcher) {
  for (const tag of cleanTags(tags)) {
    const ids = themesForTag(tag, matcher)
    for (const id of ids) votes.set(id, (votes.get(id) ?? 0) + weight / ids.length)
  }
}

/**
 * Les voix d'un CD. Les styles (plus précis) pèsent plus que les grands genres.
 * HYPOTHÈSE : poids genre = 1, style = 1,5, « Soundtrack » dans le type d'album = 3 pour les BO.
 */
export function cdVotes(cd: Cd, rules: ClassificationRules, matcher: Matcher): Votes {
  const votes: Votes = new Map()
  // Jeux vidéo : seule la console compte (les genres sont gardés pour information).
  if (mediaOf(cd) === 'jeu') {
    // (pas de nettoyage des étiquettes ici : « PlayStation 2 » contient un chiffre)
    // Une console qui a son propre thème (créé par toi) passe avant « Autres consoles ».
    const ids = cd.platform ? themesForTag(platformLabel(cd.platform), matcher) : []
    const own = ids.filter((id) => rules.themes.find((t) => t.id === id)?.special !== 'divers')
    for (const id of own.length ? own : ids) votes.set(id, 1)
    return votes
  }
  addTags(votes, cd.genres, 1, matcher)
  addTags(votes, cd.styles, 1.5, matcher)
  const types = (cd.releaseTypes ?? []).map((t) => t.toLowerCase())
  const special = (s: string) => rules.themes.find((t) => t.special === s)?.id
  const bo = special('bo')
  const divers = special('divers')
  if (bo && types.includes('soundtrack')) votes.set(bo, (votes.get(bo) ?? 0) + 3)
  if (divers && types.some((t) => ['audiobook', 'spokenword', 'spoken word', 'interview', 'audio drama'].includes(t))) {
    votes.set(divers, (votes.get(divers) ?? 0) + 3)
  }
  return votes
}

function total(votes: Votes): number {
  let sum = 0
  for (const v of votes.values()) sum += v
  return sum
}

// ---------------------------------------------------------------------------
// Construction du plan
// ---------------------------------------------------------------------------

interface Group {
  key: string
  cds: Cd[]
  isCompilation: boolean
  personal: boolean
}

function groupCds(cds: Cd[]): Group[] {
  const groups = new Map<string, Group>()
  for (const cd of cds) {
    // Compilations (du commerce ou perso) : chaque CD est un groupe à lui seul.
    const key = groupKeyOf(cd)
    const g = groups.get(key) ?? {
      key,
      cds: [],
      // « cd:<id> » : objet rangé seul, à son titre (compilation multi-artistes, film).
      isCompilation: key.startsWith('cd:'),
      personal: !!cd.personalCompilation,
    }
    g.cds.push(cd)
    groups.set(key, g)
  }
  return [...groups.values()]
}

/** Valeur la plus fréquente d'une liste (pour choisir le nom affiché d'un artiste). */
function mostCommon(values: string[]): string {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

/**
 * L'artiste chante-t-il en français ? D'abord d'après la langue des textes, sinon d'après son pays.
 * Un album instrumental (langue « zxx ») compte comme « pas en français » : sans cela,
 * Jean-Michel Jarre ou Justice iraient en Musique française à cause de leur pays.
 */
function frenchReason(cds: Cd[], info: ArtistInfo | undefined): string | null {
  const languages = cds.map((c) => c.language).filter((l): l is string => !!l && l !== 'mul')
  if (languages.length) {
    const fra = languages.filter((l) => l === 'fra').length
    return fra * 2 > languages.length ? 'Artiste francophone (langue des textes)' : null
  }
  // Langue inconnue (CD scannés avant qu'on la récupère) : le style « Chanson » sur au moins la moitié de ses CD.
  const chanson = cds.filter((c) =>
    [...c.genres, ...c.styles].some((t) => /^(chanson|chanson francaise|variete francaise|french pop)$/.test(normalizeText(t))),
  ).length
  if (chanson * 2 >= cds.length) return 'Chanson française (style)'
  return info?.country === 'FR' ? 'Artiste français (pays : France)' : null
}

export function buildPlan(
  cds: Cd[],
  rules: ClassificationRules,
  artistInfos: Map<string, ArtistInfo> = new Map(),
): Plan {
  const start = Date.now()
  const matcher = buildMatcher(rules)
  const themeById = new Map(rules.themes.map((t) => [t.id, t]))
  const themeOrder = new Map(rules.themes.map((t, i) => [t.id, i]))
  const specialId = (s: string) => rules.themes.find((t) => t.special === s)?.id
  const frenchId = rules.frenchTheme ? specialId('francaise') : undefined
  const compilationsId = specialId('compilations')

  // 1-3. Un thème par artiste
  const artists: PlanArtist[] = groupCds(cds).map((group) => {
    const first = group.cds[0]
    const single = group.isCompilation || group.personal
    const rawSeries = group.key.startsWith('serie:') ? mostCommon(group.cds.map((c) => c.series ?? '')) : undefined
    const series = rawSeries ? seriesLabel(rawSeries) : undefined
    const author = mostCommon(group.cds.map((c) => c.artist))
    const name = single ? first.title : series ? `${series} (${author})` : author
    const sortName = single
      ? titleSortKey(first.title)
      : mostCommon(group.cds.map((c) => c.artistSort || c.artist))

    // Votes : chaque CD dont on connaît le genre pèse autant que les autres.
    const votes: Votes = new Map()
    let reason = ''
    for (const cd of group.cds) {
      const v = cdVotes(cd, rules, matcher)
      const sum = total(v)
      if (!sum) continue
      for (const [id, n] of v) votes.set(id, (votes.get(id) ?? 0) + n / sum)
    }
    // Aucun genre sur ses CD : on se rabat sur les genres de l'artiste (MusicBrainz).
    const mbArtistId = group.cds.find((c) => c.mbArtistId)?.mbArtistId
    const info = mbArtistId ? artistInfos.get(mbArtistId) : undefined
    if (!votes.size && info && !single) {
      addTags(votes, info.genres, 1, matcher)
      addTags(votes, info.tags, 0.5, matcher)
      if (votes.size) reason = "D'après les genres de l'artiste (MusicBrainz)"
    }

    const sum = total(votes)
    const ranked = [...votes.entries()]
      .map(([themeId, v]) => ({ themeId, share: sum ? v / sum : 0 }))
      .sort((a, b) => b.share - a.share || (themeOrder.get(a.themeId) ?? 0) - (themeOrder.get(b.themeId) ?? 0))
    let themeId = ranked[0]?.themeId ?? UNCLASSIFIED
    const agreement = ranked[0]?.share ?? 0

    if (themeId === UNCLASSIFIED) {
      reason = mediaOf(first) === 'jeu' ? (first.platform ? `Aucun thème pour la console ${platformLabel(first.platform)}` : 'Console inconnue') : 'Genre inconnu'
    } else if (!reason) {
      const n = group.cds.length
      reason =
        mediaOf(first) === 'jeu'
          ? `Console : ${platformLabel(first.platform)}`
          : n === 1
          ? `Genre : ${[...first.genres, ...first.styles].slice(0, 3).join(', ')}`
          : `${Math.round(agreement * 100)} % des voix de ses ${n} ${({ cd: 'CD', livre: 'livres', video: 'films', jeu: 'jeux' } as const)[mediaOf(first)]}`
    }

    // Compilations : thème « Compilations », sauf si ce sont des BO, du classique ou pour enfants.
    if (group.isCompilation && compilationsId) {
      const special = themeById.get(themeId)?.special
      if (!special || !['bo', 'classique', 'enfants'].includes(special)) {
        themeId = compilationsId
        reason = 'Compilation multi-artistes'
      }
    }

    // Musique française
    if (frenchId && !single && !NO_FRENCH.has(themeById.get(themeId)?.special)) {
      const why = frenchReason(group.cds, info)
      if (why) {
        themeId = frenchId
        reason = why
      }
    }

    // Choix forcé par toi : prioritaire sur tout le reste.
    // 1) dans l'écran Classement (artiste ou compilation) ; 2) sinon sur la fiche d'un de ses CD.
    const ruleOverride = single
      ? rules.cdOverrides[first.id]
      : (rules.artistOverrides[group.key] ??
        group.cds.map((c) => rules.artistOverrides[artistKey(c.artist)]).find((t) => !!t))
    const cdOverride = mostCommon(
      group.cds.map((c) => c.themeOverride).filter((t): t is string => !!t && themeById.has(t)),
    )
    let forced = false
    if (ruleOverride && themeById.has(ruleOverride)) {
      themeId = ruleOverride
      reason = 'Choisi par toi'
      forced = true
    } else if (cdOverride) {
      themeId = cdOverride
      reason = 'Choisi sur la fiche du CD'
      forced = true
    }
    if (group.personal && !forced && themeId === UNCLASSIFIED) reason = 'Compilation perso : choisis son thème sur sa fiche'

    return {
      key: group.key,
      name,
      sortName,
      cds: [...group.cds].sort(byVolume),
      seriesSort: rawSeries ? seriesSortKey(rawSeries) : undefined,
      themeId,
      initialThemeId: themeId,
      reason,
      forced,
      agreement,
      alternatives: ranked.filter((r) => r.themeId !== themeId).slice(0, 3),
      isCompilation: group.isCompilation,
      personal: group.personal,
    }
  })

  // 4. Regroupement des thèmes trop petits ou en surnombre
  const merges = mergeSmallThemes(artists, rules, themeById)

  // 5. Tri et ordre de rangement
  const byTheme = new Map<string, PlanArtist[]>()
  for (const a of artists) byTheme.set(a.themeId, [...(byTheme.get(a.themeId) ?? []), a])

  const themes: PlanTheme[] = []
  for (const theme of [...rules.themes, UNCLASSIFIED_THEME]) {
    const list = byTheme.get(theme.id)
    if (!list?.length) continue
    themes.push({
      theme,
      artists: [...list].sort((a, b) => collator.compare(sortKeyIn(theme, a), sortKeyIn(theme, b))),
      cds: orderCds(list, theme),
    })
  }

  const placement = new Map<string, { themeId: string; shelfOrder: number }>()
  let shelfOrder = 0
  for (const t of themes) for (const cd of t.cds) placement.set(cd.id, { themeId: t.theme.id, shelfOrder: shelfOrder++ })

  return {
    themes,
    unclassified: byTheme.get(UNCLASSIFIED) ?? [],
    disputed: artists.filter(
      (a) => !a.forced && !a.isCompilation && !a.personal && a.cds.length > 1 && a.agreement < DISPUTE_THRESHOLD,
    ),
    merges,
    placement,
    cdCount: cds.length,
    durationMs: Date.now() - start,
  }
}

/** Regroupe les thèmes trop petits dans leur thème parent, puis les plus petits tant qu'il y en a trop. */
function mergeSmallThemes(
  artists: PlanArtist[],
  rules: ClassificationRules,
  themeById: Map<string, ThemeDef>,
): PlanMerge[] {
  const merges: PlanMerge[] = []
  // Thèmes déjà absorbés → thème qui les a absorbés. Si le parent d'un thème a lui-même été regroupé,
  // on suit la chaîne jusqu'au thème final (ex. Électro → Pop → Rock).
  const redirect = new Map<string, string>()
  const resolve = (id: string) => {
    for (let i = 0; redirect.has(id) && i < 50; i++) id = redirect.get(id)!
    return id
  }
  const targetOf = (id: string) => {
    const parent = themeById.get(id)?.mergeInto
    if (!parent || !themeById.has(parent)) return undefined
    const target = resolve(parent)
    return target !== id ? target : undefined
  }
  const count = () => {
    const c = new Map<string, number>()
    for (const a of artists) if (a.themeId !== UNCLASSIFIED) c.set(a.themeId, (c.get(a.themeId) ?? 0) + a.cds.length)
    return c
  }
  for (let guard = 0; guard < rules.themes.length; guard++) {
    const counts = count()
    const mergeable = [...counts.entries()]
      .filter(([id]) => !!targetOf(id))
      .sort((a, b) => a[1] - b[1])
    const tooSmall = mergeable.find(([, n]) => n < rules.minCdsPerTheme)
    const tooMany = counts.size > rules.maxThemes ? mergeable[0] : undefined
    const pick = tooSmall ?? tooMany
    if (!pick) break
    const [fromId, n] = pick
    const from = themeById.get(fromId)!
    const into = themeById.get(targetOf(fromId)!)!
    for (const a of artists) if (a.themeId === fromId) a.themeId = into.id
    redirect.set(fromId, into.id)
    merges.push({
      from,
      into,
      count: n,
      reason: tooSmall ? `moins de ${rules.minCdsPerTheme} CD` : `plus de ${rules.maxThemes} thèmes`,
    })
  }
  return merges
}

/**
 * Les CD d'un thème dans l'ordre de rangement.
 * Les compilations perso (CD gravés…) viennent à la fin du thème, par ordre alphabétique de leur nom.
 */
function orderCds(all: PlanArtist[], theme: ThemeDef): Cd[] {
  const personal = all
    .filter((a) => a.personal)
    .flatMap((a) => a.cds)
    .sort((a, b) => collator.compare(titleSortKey(a.title), titleSortKey(b.title)))
  return [...orderRegular(all.filter((a) => !a.personal), theme), ...personal]
}

function orderRegular(artists: PlanArtist[], theme: ThemeDef): Cd[] {
  if (theme.sortBy === 'titre') {
    return artists
      .flatMap((a) => a.cds)
      .sort((a, b) => collator.compare(titleSortKey(a.title), titleSortKey(b.title)) || byYear(a, b))
  }
  if (theme.sortBy === 'compositeur') {
    const key = new Map<string, string>()
    for (const a of artists) for (const cd of a.cds) key.set(cd.id, cd.composer?.trim() || a.sortName)
    return artists
      .flatMap((a) => a.cds)
      .sort((a, b) => collator.compare(key.get(a.id)!, key.get(b.id)!) || byYear(a, b))
  }
  return [...artists]
    .sort((a, b) => collator.compare(sortKeyIn(theme, a), sortKeyIn(theme, b)))
    .flatMap((a) => a.cds)
}

/**
 * Clé de tri d'un groupe dans son thème. Thème « par série » (BD, mangas, comics) : le nom de la série,
 * et pour un album isolé le nom de son auteur (même ordre alphabétique). Sinon : le nom de tri de l'auteur
 * ou de l'artiste (une série de romans se range donc chez son auteur).
 */
function sortKeyIn(theme: ThemeDef, a: PlanArtist): string {
  return theme.sortBy === 'serie' ? (a.seriesSort ?? a.sortName) : a.sortName
}
