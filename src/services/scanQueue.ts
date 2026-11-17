import { db, newId } from '../db/database'
import type { Candidate, CdDraft, ScanItem } from '../db/types'
import { canonicalBarcode, isValidGtin } from '../lib/barcode'
import { addCd, findByBarcode } from './collection'
import { hasDiscogsToken } from './discogs'
import { enrichCandidate, identifyBarcode } from './identify'
import { currentMedia, settings } from './settings'
import { identifyBook, isIsbn } from './books'
import { identifyFilm, videoSize } from './films'
import { gameSize, identifyGame } from './games'
import type { MusicFormat, Platform, VideoFormat } from '../db/types'
import { musicSize } from '../lib/musicFormats'
import type { MediaKind } from '../lib/media'

// La file d'attente du scan en rafale.
//
// Chaque code scanné est rangé immédiatement dans la base (rien n'est perdu si l'appli se ferme),
// puis un « travailleur » en arrière-plan les identifie un par un, au rythme imposé par MusicBrainz.
// Tu valides ensuite le tout en une fois.

export type AddScanResult = 'ajoute' | 'deja_dans_la_file' | 'invalide'

/** Ajoute un code-barres scanné ou tapé à la file. */
export async function addScan(raw: string, media: MediaKind = currentMedia()): Promise<AddScanResult> {
  const code = canonicalBarcode(raw)
  if (!isValidGtin(code)) return 'invalide'
  // Un ISBN est forcément un livre, même scanné depuis l'univers CD.
  if (isIsbn(code)) media = 'livre'
  // Un même code lu deux fois de suite (fréquent en rafale) n'est ajouté qu'une fois.
  if (await db.scans.where('barcode').equals(code).count()) return 'deja_dans_la_file'
  const duplicates = await findByBarcode(code)
  const item: ScanItem = {
    id: newId(),
    barcode: code,
    media,
    ...(media === 'jeu' && settings.scanPlatform ? { platform: settings.scanPlatform } : {}),
    scannedAt: Date.now(),
    state: 'en_attente',
    candidates: [],
    chosenByUser: false,
    duplicateOfIds: duplicates.map((d) => d.id),
    // Déjà dans la collection → pas ajouté par défaut (tu peux forcer pour un 2e exemplaire).
    include: duplicates.length === 0,
    attempts: 0,
  }
  await db.scans.add(item)
  startProcessing()
  return 'ajoute'
}

/** Ce code est-il un livre (ISBN, ou scanné dans l'univers Livres / BD) ? */
export function isBookScan(item: Pick<ScanItem, 'barcode' | 'media'>): boolean {
  return item.media === 'livre' || isIsbn(item.barcode)
}

export function chosenCandidate(item: ScanItem): Candidate | undefined {
  return item.candidates.find((c) => c.key === item.chosenKey)
}

// ---------------------------------------------------------------------------
// Travailleur en arrière-plan
// ---------------------------------------------------------------------------

let running = false

/** Lance le traitement de la file s'il n'est pas déjà en cours. */
export function startProcessing(): void {
  if (!running) void processLoop()
}

async function processLoop(): Promise<void> {
  running = true
  try {
    while (navigator.onLine) {
      const item = await nextWork()
      if (!item) break
      await processItem(item)
    }
  } finally {
    running = false
  }
}

/** Le prochain élément à traiter : d'abord les codes non cherchés, puis les détails à compléter. */
async function nextWork(): Promise<ScanItem | undefined> {
  const waiting = await db.scans.where('state').equals('en_attente').sortBy('scannedAt')
  if (waiting.length) return waiting[0]
  const ready = await db.scans.where('state').equals('trouve').sortBy('scannedAt')
  return ready.find((i) => chosenCandidate(i)?.enriched === false)
}

async function processItem(item: ScanItem): Promise<void> {
  if (item.state === 'en_attente') {
    await db.scans.update(item.id, { state: 'recherche' })
    try {
      const result = isBookScan(item)
        ? await identifyBook(item.barcode)
        : item.media === 'video'
          ? await identifyFilm(item.barcode)
          : item.media === 'jeu'
            ? await identifyGame(item.barcode, item.platform)
            : await identifyBarcode(item.barcode)
      item = {
        ...item,
        state: result.state,
        candidates: result.candidates,
        chosenKey: result.state === 'trouve' ? result.candidates[0].key : undefined,
        error: undefined,
      }
      await db.scans.put(item)
    } catch (e) {
      await db.scans.update(item.id, {
        state: 'erreur',
        error: e instanceof Error ? e.message : String(e),
        attempts: item.attempts + 1,
      })
      return
    }
  }
  await enrichChosen(item)
}

async function enrichChosen(item: ScanItem): Promise<void> {
  const chosen = chosenCandidate(item)
  if (!chosen || chosen.enriched) return
  let enriched: Candidate
  try {
    // Un choix que tu viens de faire passe avant le reste de la file.
    enriched = await enrichCandidate(chosen, item.chosenByUser ? 'high' : 'normal')
  } catch {
    // Pas grave : on garde les infos déjà obtenues (l'année sera celle de l'édition).
    enriched = { ...chosen, enriched: true }
    enriched.draft.confidenceReasons = [...chosen.draft.confidenceReasons, 'Détails incomplets (réseau)']
  }
  const fresh = await db.scans.get(item.id)
  if (!fresh) return // supprimé entre-temps
  await db.scans.update(item.id, {
    candidates: fresh.candidates.map((c) => (c.key === enriched.key ? enriched : c)),
  })
}

/** Au démarrage : remet en attente ce qui était en cours quand l'appli a été fermée. */
export async function recoverQueue(): Promise<void> {
  await db.scans.where('state').equals('recherche').modify({ state: 'en_attente' })
  startProcessing()
}

/** Relance les éléments en erreur (bouton « Réessayer », ou retour de la connexion). */
export async function retryErrors(): Promise<void> {
  await db.scans.where('state').equals('erreur').modify({ state: 'en_attente', error: undefined })
  startProcessing()
}

// ---------------------------------------------------------------------------
// Actions de l'utilisateur
// ---------------------------------------------------------------------------

/** Tu choisis une proposition parmi plusieurs. */
export async function chooseCandidate(itemId: string, key: string): Promise<void> {
  await db.scans.update(itemId, { chosenKey: key, chosenByUser: true, state: 'trouve' })
  startProcessing()
}

/**
 * Jeux : choisit la console d'un jeu de la file (quand la notice ne l'indique pas).
 * Elle s'applique à toutes les propositions de ce code.
 */
export async function setScanPlatform(itemId: string, platform: Platform): Promise<void> {
  const item = await db.scans.get(itemId)
  if (!item) return
  const candidates = item.candidates.map((c) => ({
    ...c,
    draft: {
      ...c.draft,
      platform,
      ...gameSize(platform, c.draft.discCount),
      confidence: Math.max(c.draft.confidence, 85),
      confidenceReasons: [...c.draft.confidenceReasons.filter((r) => !/^Console/.test(r)), 'Console choisie par toi'],
    },
  }))
  await db.scans.update(itemId, { platform, candidates })
}

/** Film ou musique : le support choisi (DVD, Blu-ray, VHS… ; CD, vinyle…) et les dimensions qui vont avec. */
export function withSupport(d: CdDraft, support: VideoFormat | MusicFormat): CdDraft {
  if (d.media === 'video') return { ...d, videoFormat: support as VideoFormat, ...videoSize(support as VideoFormat, d.discCount) }
  if ((d.media ?? 'cd') === 'cd') {
    const f = support as MusicFormat
    const size = musicSize(f, d.discCount)
    return { ...d, musicFormat: f === 'cd' ? undefined : f, ...(size ?? { thicknessMm: settings.thickness[d.format], heightCm: undefined }) }
  }
  return d
}

/** Film ou musique de la file : tu changes le support (il s'applique à toutes les propositions de ce code). */
export async function setScanSupport(itemId: string, support: VideoFormat | MusicFormat): Promise<void> {
  const item = await db.scans.get(itemId)
  if (!item) return
  const candidates = item.candidates.map((c) => ({ ...c, draft: withSupport(c.draft, support) }))
  await db.scans.update(itemId, { candidates })
}

/**
 * Code introuvable : tu as cherché l'objet par son titre directement dans la file et choisi un résultat.
 * Il prend la place de la proposition, AVEC le code-barres scanné (la prochaine fois, ce code sera reconnu
 * comme déjà dans ta collection). Jeu sans console connue : celle choisie pour la recherche.
 */
export async function useSearchResult(
  itemId: string,
  picked: Candidate,
  platform?: Platform,
  support?: VideoFormat | MusicFormat,
): Promise<void> {
  const item = await db.scans.get(itemId)
  if (!item) return
  // Copie simple : le résultat affiché est un objet « réactif » de Vue, que la base ne sait pas enregistrer.
  const c: Candidate = JSON.parse(JSON.stringify(picked))
  const d = c.draft
  const fixPlatform = d.media === 'jeu' && !d.platform && platform ? { platform, ...gameSize(platform, d.discCount) } : {}
  const draft = {
    ...(support ? withSupport(d, support) : d),
    ...fixPlatform,
    barcode: item.barcode,
    noBarcode: undefined,
    status: 'identifie' as const,
    confidence: Math.max(d.confidence, 85),
    confidenceReasons: ['Code-barres inconnu : choisi par toi après une recherche par titre'],
  }
  const key = `titre:${c.key}`
  await db.scans.update(itemId, {
    state: 'trouve',
    candidates: [{ ...c, key, draft }],
    chosenKey: key,
    chosenByUser: false,
    include: !item.duplicateOfIds.length,
    platform: draft.platform ?? item.platform,
    error: undefined,
  })
  // Détails complémentaires (image RAWG, affiche TMDB…) si la proposition n'est pas encore complète.
  startProcessing()
}

export async function setInclude(itemId: string, include: boolean): Promise<void> {
  await db.scans.update(itemId, { include })
}

export async function removeScan(itemId: string): Promise<void> {
  await db.scans.delete(itemId)
}

/**
 * Prêt à être ajouté : une proposition est retenue ET ses détails sont récupérés
 * (sinon on enregistrerait l'année de la réédition au lieu de celle de l'album).
 */
export function isReady(item: ScanItem): boolean {
  return item.state === 'trouve' && chosenCandidate(item)?.enriched === true
}

/** La fiche finale d'un élément (la proposition retenue, ajustée si tu l'as choisie toi-même). */
export function finalDraft(item: ScanItem): CdDraft | undefined {
  const chosen = chosenCandidate(item)
  if (!chosen) return undefined
  const draft: CdDraft = JSON.parse(JSON.stringify(chosen.draft))
  if (item.chosenByUser) {
    // Ton choix vaut confirmation.
    draft.confidence = Math.max(draft.confidence, 85)
    draft.confidenceReasons = [...draft.confidenceReasons, 'Choisi par toi parmi plusieurs propositions']
    draft.status = 'identifie'
  }
  return draft
}

/** Validation groupée : ajoute à la collection tous les éléments prêts et cochés. */
export async function validateReady(): Promise<number> {
  const items = await db.scans.where('state').equals('trouve').toArray()
  let added = 0
  for (const item of items) {
    const draft = finalDraft(item)
    if (!item.include || !draft || !isReady(item)) continue
    await db.transaction('rw', db.cds, db.scans, async () => {
      await addCd(draft)
      await db.scans.delete(item.id)
    })
    added++
  }
  return added
}

/**
 * Les codes introuvables partent dans la collection avec le statut « à vérifier »,
 * pour être complétés plus tard (par exemple sur le PC, au calme).
 */
export async function sendUnknownToReview(): Promise<number> {
  const items = await db.scans.where('state').equals('introuvable').toArray()
  const reason = hasDiscogsToken()
    ? 'Code-barres inconnu de MusicBrainz et de Discogs'
    : 'Code-barres inconnu de MusicBrainz (Discogs non configuré)'
  for (const item of items) {
    const book = isBookScan(item)
    const film = !book && item.media === 'video'
    const game = !book && item.media === 'jeu'
    await db.transaction('rw', db.cds, db.scans, async () => {
      await addCd({
        ...(book ? { media: 'livre' as const, bookKind: 'livre' as const, heightCm: 20 } : {}),
        ...(film ? { media: 'video' as const, videoFormat: 'dvd' as const, heightCm: videoSize('dvd', 1).heightCm } : {}),
        ...(game ? { media: 'jeu' as const, platform: item.platform, heightCm: gameSize(item.platform).heightCm } : {}),
        barcode: item.barcode,
        artist: 'Inconnu',
        artistSort: 'Inconnu',
        title: book ? `ISBN ${item.barcode}` : `Code ${item.barcode}`,
        genres: [],
        styles: [],
        format: 'standard',
        discCount: 1,
        thicknessMm: book ? 20 : film ? videoSize('dvd', 1).thicknessMm : game ? gameSize(item.platform).thicknessMm : settings.thickness.standard,
        coverUrls: [],
        isCompilation: false,
        status: 'a_verifier',
        confidence: 0,
        confidenceReasons: [book ? 'ISBN inconnu de la BnF et d\'Open Library' : film || game ? 'Code-barres inconnu de la BnF' : reason],
        source: 'manuel',
      })
      await db.scans.delete(item.id)
    })
  }
  return items.length
}

// Quand la connexion revient, on reprend le travail.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void retryErrors())
}
