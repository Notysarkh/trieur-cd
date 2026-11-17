import { db, itemsOf } from '../db/database'
import type { Cd, MarketPrice } from '../db/types'
import { mediaOf } from '../lib/media'
import { HttpError } from '../lib/throttle'
import * as discogs from './discogs'

// Valeur des disques (musique) sur le marché Discogs (étude du 17/11/2026, phase 1) :
// - sans jeton : prix le plus bas en vente (en euros) et nombre d'exemplaires en vente ;
// - avec ton jeton ET tes paramètres de vendeur remplis sur Discogs : prix conseillé pour un exemplaire
//   en très bon état (VG+), plus proche d'une vraie valeur que l'offre la moins chère.
// « Ma valeur », saisie à la main sur la fiche (tous univers), passe avant l'estimation.

export const SUGGESTED_CONDITION = 'Very Good Plus (VG+)'

export interface Estimate {
  value: number
  currency: string
  source: 'moi' | 'conseille' | 'plus-bas'
}

/** La valeur retenue d'un objet : la tienne, sinon le prix conseillé, sinon le prix le plus bas. */
export function estimatedValue(cd: Pick<Cd, 'myValue' | 'market'>): Estimate | undefined {
  if (cd.myValue != null) return { value: cd.myValue, currency: 'EUR', source: 'moi' }
  const m = cd.market
  if (m?.suggested != null) return { value: m.suggested, currency: m.suggestedCurrency ?? 'EUR', source: 'conseille' }
  if (m?.lowest != null) return { value: m.lowest, currency: 'EUR', source: 'plus-bas' }
  return undefined
}

/** Montant lisible : « 12,50 € », « 8 $ ». */
export function money(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: value >= 100 ? 0 : 2 }).format(value)
}

/** Valeur totale d'une liste (en euros ; les rares prix en autre monnaie sont comptés à part). */
export function totalValue(cds: Cd[]): { eur: number; counted: number; other: number } {
  let eur = 0
  let counted = 0
  let other = 0
  for (const cd of cds) {
    const e = estimatedValue(cd)
    if (!e) continue
    if (e.currency === 'EUR') {
      eur += e.value
      counted++
    } else other++
  }
  return { eur, counted, other }
}

/** Ce disque peut-il avoir un prix Discogs (édition connue, ou code-barres à chercher avec le jeton) ? */
export function canPrice(cd: Cd): boolean {
  return mediaOf(cd) === 'cd' && (!!cd.discogsReleaseId || (!!cd.barcode && discogs.hasDiscogsToken()))
}

/** État partagé pendant une mise à jour : les prix conseillés ne sont demandés que s'ils sont accessibles. */
export interface PriceRun {
  suggestions: 'inconnu' | 'ok' | 'refuse'
}

/** Prix d'un disque : on retrouve son édition Discogs (par le code-barres) si besoin, puis on lit le marché. */
export async function priceFor(cd: Cd, run: PriceRun): Promise<Partial<Cd>> {
  let releaseId = cd.discogsReleaseId
  if (!releaseId && cd.barcode && discogs.hasDiscogsToken()) {
    releaseId = (await discogs.searchByBarcode(cd.barcode)).find((r) => r.type === 'release')?.id
  }
  const at = Date.now()
  if (!releaseId) return { market: { at } }
  const stats = await discogs.marketStats(releaseId)
  const market: MarketPrice = {
    lowest: stats.lowest_price?.value,
    forSale: stats.num_for_sale,
    at,
  }
  if (discogs.hasDiscogsToken() && run.suggestions !== 'refuse') {
    try {
      const s = (await discogs.priceSuggestions(releaseId))[SUGGESTED_CONDITION]
      run.suggestions = 'ok'
      if (s) {
        market.suggested = Math.round(s.value * 100) / 100
        market.suggestedCurrency = s.currency
      }
    } catch (e) {
      // Paramètres de vendeur pas remplis (ou jeton refusé) : on n'insiste pas pour les disques suivants.
      if (e instanceof HttpError && (e.status === 401 || e.status === 403)) run.suggestions = 'refuse'
    }
  }
  return { discogsReleaseId: releaseId, market }
}

export interface PricesProgress {
  done: number
  total: number
  found: number
  suggestions: PriceRun['suggestions']
  /** Pause imposée par Discogs (trop de demandes en une minute) : reprise à cette heure. */
  pausedUntil?: number
}

/**
 * Discogs limite le nombre de demandes par minute (mesuré le 17/11/2026 : 25 par minute sans jeton).
 * Au-delà, il répond « 429 » SANS l'autorisation qui permet à une page web de lire la réponse :
 * le navigateur ne voit alors qu'une erreur réseau. On traite donc les deux comme « trop de demandes ».
 */
export function isRateLimited(e: unknown, online = typeof navigator === 'undefined' || navigator.onLine): boolean {
  if (e instanceof HttpError) return e.status === 429
  return online && e instanceof Error && /Pas de réponse du service/.test(e.message)
}

/** Pause après un refus de Discogs (un peu plus d'une minute, le temps que sa fenêtre se vide). */
export const RATE_PAUSE_MS = 62_000
/** Rythme prudent ensuite : 25 demandes par minute au plus (2,5 s par demande). */
export const SAFE_MS_PER_REQUEST = 2500
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Met à jour le prix de tous les disques (musique). */
export async function refreshPrices(
  onProgress: (p: PricesProgress) => void,
  options: { shouldStop?: () => boolean } = {},
): Promise<PricesProgress> {
  const items = (await itemsOf('cd')).filter(canPrice)
  const run: PriceRun = { suggestions: 'inconnu' }
  const p: PricesProgress = { done: 0, total: items.length, found: 0, suggestions: run.suggestions }
  onProgress({ ...p })
  /** Rythme prudent : activé au premier refus de Discogs (2 demandes par disque avec le jeton). */
  let slow = false
  for (const cd of items) {
    if (options.shouldStop?.()) break
    for (let attempt = 0; attempt < 3; attempt++) {
      const started = Date.now()
      try {
        const changes = await priceFor(cd, run)
        if (changes.market?.lowest != null || changes.market?.suggested != null) p.found++
        await db.cds.update(cd.id, JSON.parse(JSON.stringify({ ...changes, updatedAt: Date.now() })))
        if (slow) {
          // Une ou deux demandes par disque : on attend de quoi rester sous 25 par minute.
          const requests = discogs.hasDiscogsToken() && run.suggestions !== 'refuse' ? 2 : 1
          await sleep(Math.max(0, requests * SAFE_MS_PER_REQUEST - (Date.now() - started)))
        }
        break
      } catch (e) {
        if (!isRateLimited(e)) break // Discogs injoignable pour ce disque : il garde son ancien prix.
        // Trop de demandes : pause d'une minute (affichée), rythme prudent, puis on réessaie ce disque.
        slow = true
        p.pausedUntil = Date.now() + RATE_PAUSE_MS
        onProgress({ ...p })
        for (let waited = 0; waited < RATE_PAUSE_MS && !options.shouldStop?.(); waited += 1000) await sleep(1000)
        p.pausedUntil = undefined
        if (options.shouldStop?.()) break
      }
    }
    p.done++
    p.suggestions = run.suggestions
    onProgress({ ...p })
  }
  return p
}
