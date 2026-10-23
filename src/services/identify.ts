import type { Candidate, CdDraft, ConfidenceFactors, ScanState } from '../db/types'
import { canonicalBarcode, sameBarcode } from '../lib/barcode'
import { formatFromDiscogs, formatFromMusicBrainz } from '../lib/formats'
import { cleanDiscogsArtist, guessSortName } from '../lib/sortName'
import { normalizeText, similarity, titleCase, yearFrom } from '../lib/text'
import type { Priority } from '../lib/throttle'
import * as discogs from './discogs'
import * as mb from './musicbrainz'
import { settings } from './settings'

// Le « cerveau » de l'identification : interroge MusicBrainz puis Discogs,
// fusionne les réponses et calcule un indice de confiance.

/** À partir de ce score, un CD est considéré comme identifié ; en dessous, il va dans « à vérifier ». */
export const CONFIDENCE_THRESHOLD = 80

/**
 * Indice de confiance (0 à 100). HYPOTHÈSE : barème choisi par bon sens, à ajuster à l'usage.
 *
 *   Code trouvé sur MusicBrainz ............ 65   (Discogs seul : 60)
 *   Un seul album pour ce code ............. +20  (plusieurs albums : -20)
 *   Discogs trouve le même album ........... +10
 *   Discogs propose un autre album ......... -15
 *   Genre inconnu .......................... -10
 *
 * Exemples : MusicBrainz + Discogs d'accord = 95 ; MusicBrainz seul avec genre = 85 ;
 * MusicBrainz seul sans genre = 75 → « à vérifier » (sans 2e source ni genre, rien ne permet
 * de repérer une erreur de la base, et le CD ne pourra pas être classé sans toi de toute façon) ;
 * MusicBrainz et Discogs en désaccord = 60 à 70 → « à vérifier ».
 */
export function computeConfidence(f: ConfidenceFactors): { confidence: number; reasons: string[] } {
  const reasons: string[] = []
  let score: number
  if (f.source === 'musicbrainz') {
    score = 65
    reasons.push('Code-barres trouvé sur MusicBrainz')
  } else {
    score = 60
    reasons.push('Code-barres trouvé uniquement sur Discogs')
  }
  if (f.albumsForBarcode <= 1) {
    score += 20
    reasons.push('Un seul album correspond à ce code')
  } else {
    score -= 20
    reasons.push(`${f.albumsForBarcode} albums différents pour ce code`)
  }
  switch (f.discogs) {
    case 'confirme':
      score += 10
      reasons.push('Discogs confirme')
      break
    case 'contredit':
      score -= 15
      reasons.push('Discogs propose un autre album')
      break
    case 'absent':
      reasons.push('Inconnu de Discogs')
      break
    case 'non_configure':
      reasons.push('Discogs non configuré (genres moins précis)')
      break
    case 'indisponible':
      reasons.push('Discogs injoignable')
      break
  }
  if (!f.hasGenre) {
    score -= 10
    reasons.push('Genre inconnu')
  }
  return { confidence: Math.max(0, Math.min(100, score)), reasons }
}

/** Fabrique une proposition en y appliquant l'indice de confiance. */
function makeCandidate(key: string, draft: CdDraft, factors?: ConfidenceFactors): Candidate {
  if (factors) {
    const { confidence, reasons } = computeConfidence(factors)
    draft.confidence = confidence
    draft.confidenceReasons = reasons
    draft.status = confidence >= CONFIDENCE_THRESHOLD ? 'identifie' : 'a_verifier'
  }
  return { key, draft, enriched: false, factors }
}

function hasGenre(d: CdDraft): boolean {
  return d.genres.length > 0 || d.styles.length > 0
}

/** Les noms les plus votés d'une liste de tags/genres MusicBrainz. */
function topNames(tags: mb.MbTag[] | undefined, max: number): string[] {
  return [...(tags ?? [])]
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
    .map((t) => titleCase(t.name))
}

// ---------------------------------------------------------------------------
// Conversion des réponses MusicBrainz / Discogs en fiche CD
// ---------------------------------------------------------------------------

function emptyDraft(): CdDraft {
  return {
    artist: '',
    artistSort: '',
    title: '',
    genres: [],
    styles: [],
    format: 'standard',
    discCount: 1,
    thicknessMm: settings.thickness.standard,
    coverUrls: [],
    isCompilation: false,
    status: 'a_verifier',
    confidence: 0,
    confidenceReasons: [],
    source: 'manuel',
  }
}

/** Fiche CD à partir d'une édition MusicBrainz. */
export function draftFromMbRelease(r: mb.MbRelease, barcode?: string): CdDraft {
  const credits = r['artist-credit'] ?? []
  const first = credits[0]?.artist
  const isCompilation = credits.some((c) => c.artist.id === mb.VARIOUS_ARTISTS_ID)
  const discCount = Math.max(1, r.media?.length ?? 1)
  const format = formatFromMusicBrainz(r.packaging, discCount)
  const labelInfo = r['label-info']?.find((l) => l.label?.name)
  const artist = mb.creditText(credits) || 'Artiste inconnu'
  return {
    ...emptyDraft(),
    barcode: barcode ? canonicalBarcode(barcode) : r.barcode ? canonicalBarcode(r.barcode) : undefined,
    artist,
    artistSort: first?.['sort-name'] || guessSortName(artist),
    title: r.title,
    // Année de l'édition pour l'instant ; remplacée par l'année d'origine lors de l'enrichissement.
    year: yearFrom(r.date),
    releaseYear: yearFrom(r.date),
    label: labelInfo?.label?.name,
    catalogNumber: labelInfo?.['catalog-number'] ?? undefined,
    country: r.country,
    styles: topNames(r.tags, 5),
    format,
    discCount,
    thicknessMm: settings.thickness[format],
    coverUrls: mb.coverArtUrls(r.id, r['release-group']?.id),
    isCompilation,
    language: r['text-representation']?.language ?? undefined,
    releaseTypes: r['release-group']?.['secondary-types'] ?? [],
    source: 'musicbrainz',
    mbReleaseId: r.id,
    mbReleaseGroupId: r['release-group']?.id,
    mbArtistId: first?.id,
  }
}

/** Fiche CD à partir d'un album MusicBrainz (recherche texte, sans édition précise). */
export function draftFromMbReleaseGroup(rg: mb.MbReleaseGroup): CdDraft {
  const credits = rg['artist-credit'] ?? []
  const first = credits[0]?.artist
  const artist = mb.creditText(credits) || 'Artiste inconnu'
  return {
    ...emptyDraft(),
    artist,
    artistSort: first?.['sort-name'] || guessSortName(artist),
    title: rg.title,
    year: yearFrom(rg['first-release-date']),
    genres: topNames(rg.genres, 3),
    styles: topNames(rg.tags, 5),
    coverUrls: mb.coverArtUrls(undefined, rg.id).concat(mb.coverArtUrls(rg.releases?.[0]?.id, undefined)),
    isCompilation: credits.some((c) => c.artist.id === mb.VARIOUS_ARTISTS_ID),
    releaseTypes: rg['secondary-types'] ?? [],
    source: 'musicbrainz',
    mbReleaseGroupId: rg.id,
    mbArtistId: first?.id,
  }
}

/** Fiche CD à partir d'un résultat de recherche Discogs. */
export function draftFromDiscogs(d: discogs.DgSearchResult, barcode?: string): CdDraft {
  const split = discogs.splitDiscogsTitle(d.title)
  const isCompilation = /^various$/i.test(cleanDiscogsArtist(split.artist))
  const artist = isCompilation ? 'Various Artists' : cleanDiscogsArtist(split.artist) || 'Artiste inconnu'
  const discCount = Math.max(1, d.format_quantity ?? 1)
  const format = formatFromDiscogs(d.format, discCount)
  const cover = discogs.usableCover(d.cover_image)
  return {
    ...emptyDraft(),
    barcode: barcode ? canonicalBarcode(barcode) : undefined,
    artist,
    artistSort: guessSortName(artist),
    title: split.title,
    year: yearFrom(d.year),
    releaseYear: d.type === 'release' ? yearFrom(d.year) : undefined,
    label: d.label?.[0],
    catalogNumber: d.catno,
    country: d.country,
    genres: d.genre ?? [],
    styles: d.style ?? [],
    format,
    discCount,
    thicknessMm: settings.thickness[format],
    coverUrls: cover ? [cover] : [],
    isCompilation,
    source: 'discogs',
    discogsReleaseId: d.type === 'release' ? d.id : undefined,
    discogsMasterId: d.type === 'master' ? d.id : d.master_id || undefined,
  }
}

/** Le résultat Discogs qui correspond au même album (même titre et même artiste), s'il existe. */
export function findDiscogsMatch(draft: CdDraft, results: discogs.DgSearchResult[]) {
  return results.find((d) => {
    const { artist, title } = discogs.splitDiscogsTitle(d.title)
    const artistOk =
      draft.isCompilation ? /^various/i.test(artist) : similarity(cleanDiscogsArtist(artist), draft.artist) >= 0.5
    return artistOk && similarity(title, draft.title) >= 0.6
  })
}

/** Complète une fiche MusicBrainz avec les genres/styles de Discogs (plus précis). */
function mergeDiscogs(draft: CdDraft, d: discogs.DgSearchResult): void {
  if (d.genre?.length) draft.genres = d.genre
  if (d.style?.length) draft.styles = d.style
  draft.label ??= d.label?.[0]
  draft.discogsReleaseId = d.type === 'release' ? d.id : draft.discogsReleaseId
  draft.discogsMasterId = (d.type === 'master' ? d.id : d.master_id) || draft.discogsMasterId
  const cover = discogs.usableCover(d.cover_image)
  if (cover) draft.coverUrls = [...draft.coverUrls, cover]
}

/** Parmi plusieurs éditions d'un même album, garde la plus pertinente (CD officiel, de préférence français/européen). */
function pickBestRelease(releases: mb.MbRelease[]): mb.MbRelease {
  const rank = (r: mb.MbRelease) =>
    (r.media?.some((m) => m.format?.includes('CD')) ? 0 : 100) +
    (r.status === 'Official' ? 0 : 10) +
    (r.country === 'FR' ? 0 : r.country === 'XE' ? 1 : 2)
  return [...releases].sort((a, b) => rank(a) - rank(b))[0]
}

// ---------------------------------------------------------------------------
// Identification par code-barres
// ---------------------------------------------------------------------------

export interface IdentifyResult {
  state: Extract<ScanState, 'trouve' | 'a_choisir' | 'introuvable'>
  candidates: Candidate[]
}

export async function identifyBarcode(rawBarcode: string): Promise<IdentifyResult> {
  const code = canonicalBarcode(rawBarcode)

  // 1. MusicBrainz : on ne garde que les éditions dont le code est exactement le bon.
  // 2. Discogs (si un jeton est configuré), interrogé EN MÊME TEMPS que MusicBrainz pour gagner du temps.
  //    Une panne Discogs ne bloque pas l'identification.
  type DiscogsAnswer = { status: 'ok' | 'non_configure' | 'indisponible'; results: discogs.DgSearchResult[] }
  const discogsSearch: Promise<DiscogsAnswer> = discogs.hasDiscogsToken()
    ? discogs.searchByBarcode(code).then(
        (results) => ({ status: 'ok', results }),
        () => ({ status: 'indisponible', results: [] }),
      )
    : Promise.resolve({ status: 'non_configure', results: [] })
  const [mbAll, dg] = await Promise.all([mb.searchReleasesByBarcode(code), discogsSearch])
  const dgResults = dg.results
  const discogsStatus = dg.status
  const mbReleases = mbAll.filter((r) => sameBarcode(r.barcode ?? '', code))

  const candidates: Candidate[] = []

  if (mbReleases.length) {
    // 3a. On regroupe les éditions par album (« release group ») : une proposition par album.
    const groups = new Map<string, mb.MbRelease[]>()
    for (const r of mbReleases) {
      const key = r['release-group']?.id ?? r.id
      groups.set(key, [...(groups.get(key) ?? []), r])
    }
    for (const releases of groups.values()) {
      const best = pickBestRelease(releases)
      const draft = draftFromMbRelease(best, code)
      let discogsOpinion: ConfidenceFactors['discogs'] =
        discogsStatus === 'ok' ? (dgResults.length ? 'contredit' : 'absent') : discogsStatus
      const match = findDiscogsMatch(draft, dgResults)
      if (match) {
        mergeDiscogs(draft, match)
        discogsOpinion = 'confirme'
      }
      candidates.push(
        makeCandidate(`mb:${best.id}`, draft, {
          source: 'musicbrainz',
          albumsForBarcode: groups.size,
          discogs: discogsOpinion,
          hasGenre: hasGenre(draft),
        }),
      )
    }
  } else if (dgResults.length) {
    // 3b. Inconnu de MusicBrainz mais connu de Discogs : une proposition par album Discogs.
    const groups = new Map<string, discogs.DgSearchResult>()
    for (const d of dgResults) {
      const key = d.master_id ? `m${d.master_id}` : normalizeText(d.title)
      if (!groups.has(key)) groups.set(key, d)
    }
    for (const d of groups.values()) {
      const draft = draftFromDiscogs(d, code)
      candidates.push(
        makeCandidate(`dg:${d.id}`, draft, {
          source: 'discogs',
          albumsForBarcode: groups.size,
          discogs: 'source',
          hasGenre: hasGenre(draft),
        }),
      )
    }
  }

  candidates.sort((a, b) => b.draft.confidence - a.draft.confidence)
  const state = candidates.length === 0 ? 'introuvable' : candidates.length === 1 ? 'trouve' : 'a_choisir'
  return { state, candidates }
}

/**
 * Récupère les détails complémentaires d'une proposition :
 * l'année de première sortie de l'album (pour le tri chronologique) et ses genres.
 * Coûte une requête de plus, donc on ne le fait que pour la proposition retenue.
 */
export async function enrichCandidate(c: Candidate, priority: Priority = 'normal'): Promise<Candidate> {
  const draft: CdDraft = { ...c.draft }
  // Les demandes à MusicBrainz et à Discogs partent en même temps ; on applique ensuite les réponses dans l'ordre.
  const [rg, master, dgText] = await Promise.all([
    draft.mbReleaseGroupId ? mb.lookupReleaseGroup(draft.mbReleaseGroupId, priority) : null,
    !draft.mbReleaseGroupId && draft.discogsMasterId && discogs.hasDiscogsToken()
      ? discogs.getMaster(draft.discogsMasterId, priority)
      : null,
    // Discogs ne connaît pas ce code-barres : on cherche l'album par artiste + titre pour ses styles.
    needsDiscogsText(draft) ? discogs.searchByText(draft.artist, draft.title, priority).catch(() => null) : null,
  ])
  if (rg) {
    draft.year = yearFrom(rg['first-release-date']) ?? draft.year
    if (rg['secondary-types']?.length) draft.releaseTypes = rg['secondary-types']
    if (!draft.genres.length) draft.genres = topNames(rg.genres, 3)
    if (!draft.styles.length) draft.styles = topNames(rg.tags, 5)
  }
  if (master) draft.year = master.year || draft.year
  if (dgText) applyDiscogsText(draft, dgText)
  // Le genre a pu être trouvé entre-temps : on recalcule la confiance.
  if (c.factors) return { ...makeCandidate(c.key, draft, { ...c.factors, hasGenre: hasGenre(draft) }), enriched: true }
  return { key: c.key, draft, enriched: true }
}

/**
 * Complète une fiche sans données Discogs en cherchant l'album par artiste + titre.
 * Discogs a des genres/styles plus fins, utiles au classement. Renvoie vrai si la fiche a été complétée.
 * Ne touche pas à l'indice de confiance (ce n'est pas une confirmation du code-barres).
 */
export async function completeWithDiscogs(draft: CdDraft): Promise<boolean> {
  if (!needsDiscogsText(draft)) return false
  try {
    return applyDiscogsText(draft, await discogs.searchByText(draft.artist, draft.title))
  } catch {
    return false
  }
}

/** Une recherche Discogs par artiste + titre serait-elle utile pour cette fiche ? */
function needsDiscogsText(draft: CdDraft): boolean {
  if (!discogs.hasDiscogsToken() || draft.discogsReleaseId || draft.discogsMasterId || draft.isCompilation) return false
  return !!draft.artist && draft.artist !== 'Inconnu'
}

/** Applique le résultat d'une recherche Discogs par artiste + titre. Renvoie vrai si la fiche a été complétée. */
function applyDiscogsText(draft: CdDraft, results: discogs.DgSearchResult[]): boolean {
  // Mémorise que la recherche a été faite, pour que « Compléter » ne la refasse pas.
  draft.discogsCheckedAt = Date.now()
  const match = findDiscogsMatch(draft, results)
  if (!match) return false
  mergeDiscogs(draft, match)
  return true
}

// ---------------------------------------------------------------------------
// Recherche texte (plan B quand il n'y a pas de code-barres)
// ---------------------------------------------------------------------------

export interface TextSearchResult {
  candidates: Candidate[]
  /** Problèmes rencontrés (ex. MusicBrainz surchargé), à afficher. */
  warnings: string[]
}

export async function searchByText(artist: string, title: string): Promise<TextSearchResult> {
  // Les deux bases sont interrogées en même temps ; si l'une échoue, on garde les résultats de l'autre.
  const [mbAnswer, dgAnswer] = await Promise.allSettled([
    mb.searchReleaseGroups(artist, title),
    discogs.hasDiscogsToken() ? discogs.searchByText(artist, title, 'high') : Promise.resolve([]),
  ])
  const warnings: string[] = []
  const reason = (r: PromiseRejectedResult) => (r.reason instanceof Error ? r.reason.message : 'erreur')
  if (mbAnswer.status === 'rejected') warnings.push(`MusicBrainz n'a pas répondu (${reason(mbAnswer)}).`)
  if (dgAnswer.status === 'rejected') warnings.push(`Discogs n'a pas répondu (${reason(dgAnswer)}).`)
  if (mbAnswer.status === 'rejected' && dgAnswer.status === 'rejected') throw new Error(warnings.join(' '))
  const mbGroups = mbAnswer.status === 'fulfilled' ? mbAnswer.value : []
  const dgResults = dgAnswer.status === 'fulfilled' ? dgAnswer.value : []
  const candidates: Candidate[] = []
  const usedDiscogs = new Set<number>()
  for (const rg of mbGroups) {
    const draft = draftFromMbReleaseGroup(rg)
    const match = findDiscogsMatch(draft, dgResults.filter((d) => !usedDiscogs.has(d.id)))
    if (match) {
      mergeDiscogs(draft, match)
      usedDiscogs.add(match.id)
    }
    candidates.push(makeCandidate(`mb:${rg.id}`, draft))
  }
  // Les albums que seul Discogs connaît viennent ensuite.
  for (const d of dgResults) {
    if (!usedDiscogs.has(d.id)) candidates.push(makeCandidate(`dg:${d.id}`, draftFromDiscogs(d)))
  }
  return { candidates, warnings }
}
