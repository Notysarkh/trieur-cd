import { describe, expect, it, vi } from 'vitest'
import type { Cd } from '../db/types'
import { HttpError } from '../lib/throttle'

// Valeur des disques (Discogs) : réponses de Discogs simulées, aucune vraie demande.

const dg = vi.hoisted(() => ({
  token: true,
  marketStats: vi.fn(),
  priceSuggestions: vi.fn(),
  searchByBarcode: vi.fn(),
}))
vi.mock('./discogs', () => ({
  hasDiscogsToken: () => dg.token,
  marketStats: dg.marketStats,
  priceSuggestions: dg.priceSuggestions,
  searchByBarcode: dg.searchByBarcode,
}))

import { estimatedValue, money, priceFor, totalValue, type PriceRun } from './prices'

const disc = (extra: Partial<Cd>) => ({ id: 'x', media: undefined, title: 'T', ...extra }) as Cd

describe('valeur des disques', () => {
  it('ma valeur, sinon le prix conseillé, sinon le plus bas', () => {
    expect(estimatedValue(disc({ myValue: 30, market: { suggested: 12, lowest: 3, at: 1 } }))).toMatchObject({ value: 30, source: 'moi' })
    expect(estimatedValue(disc({ market: { suggested: 12, suggestedCurrency: 'EUR', lowest: 3, at: 1 } }))).toMatchObject({ value: 12, source: 'conseille' })
    expect(estimatedValue(disc({ market: { lowest: 3, at: 1 } }))).toMatchObject({ value: 3, source: 'plus-bas' })
    expect(estimatedValue(disc({ market: { at: 1 } }))).toBeUndefined()
  })

  it('total en euros ; une autre monnaie est comptée à part', () => {
    const t = totalValue([
      disc({ myValue: 10 }),
      disc({ market: { lowest: 2.5, at: 1 } }),
      disc({ market: { suggested: 8, suggestedCurrency: 'USD', at: 1 } }),
      disc({}),
    ])
    expect(t).toEqual({ eur: 12.5, counted: 2, other: 1 })
    expect(money(12.5).replace(/\s/g, ' ')).toBe('12,50 €')
  })

  it('prix conseillé (VG+) et prix le plus bas ; l’édition est retrouvée par le code-barres', async () => {
    dg.searchByBarcode.mockResolvedValue([{ id: 7, type: 'release' }])
    dg.marketStats.mockResolvedValue({ num_for_sale: 42, lowest_price: { value: 3.2, currency: 'EUR' } })
    dg.priceSuggestions.mockResolvedValue({ 'Very Good Plus (VG+)': { value: 11.456, currency: 'EUR' }, 'Mint (M)': { value: 20, currency: 'EUR' } })
    const run: PriceRun = { suggestions: 'inconnu' }
    const c = await priceFor(disc({ barcode: '0077774644020' }), run)
    expect(c.discogsReleaseId).toBe(7)
    expect(c.market).toMatchObject({ lowest: 3.2, forSale: 42, suggested: 11.46, suggestedCurrency: 'EUR' })
    expect(run.suggestions).toBe('ok')
  })

  it('paramètres de vendeur pas remplis : prix conseillé refusé une fois, puis plus demandé', async () => {
    dg.marketStats.mockResolvedValue({ num_for_sale: 0, lowest_price: null })
    dg.priceSuggestions.mockReset().mockRejectedValue(new HttpError(403, 'refus'))
    const run: PriceRun = { suggestions: 'inconnu' }
    const a = await priceFor(disc({ discogsReleaseId: 1 }), run)
    expect(run.suggestions).toBe('refuse')
    expect(a.market).toMatchObject({ lowest: undefined, forSale: 0 })
    await priceFor(disc({ discogsReleaseId: 2 }), run)
    expect(dg.priceSuggestions).toHaveBeenCalledTimes(1)
  })

  it('sans jeton : seulement le marché, pas de prix conseillé', async () => {
    dg.token = false
    dg.priceSuggestions.mockReset()
    dg.marketStats.mockResolvedValue({ num_for_sale: 5, lowest_price: { value: 1, currency: 'EUR' } })
    const c = await priceFor(disc({ discogsReleaseId: 3 }), { suggestions: 'inconnu' })
    expect(c.market).toMatchObject({ lowest: 1, forSale: 5 })
    expect(dg.priceSuggestions).not.toHaveBeenCalled()
    dg.token = true
  })
})
