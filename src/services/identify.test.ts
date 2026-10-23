import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mbRubberSoul from './__fixtures__/mb-barcode-077774644020.json'
import { identifyBarcode } from './identify'
import { settings } from './settings'

// Tests de l'identification, sans réseau : on simule les réponses de MusicBrainz et Discogs.
// La réponse MusicBrainz est une vraie réponse enregistrée (Rubber Soul des Beatles, 17 éditions).

const discogsRubberSoul = {
  id: 1234,
  type: 'release',
  title: 'The Beatles - Rubber Soul',
  year: '1987',
  genre: ['Rock'],
  style: ['Pop Rock', 'Beat'],
  format: ['CD', 'Album', 'Reissue'],
  format_quantity: 1,
  label: ['Parlophone'],
  master_id: 46402,
  cover_image: 'https://i.discogs.com/rubber.jpg',
}

/** Remplace `fetch` par une fonction qui répond selon l'adresse demandée. */
function mockFetch(routes: { mb?: unknown; discogs?: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.includes('musicbrainz.org') ? routes.mb : routes.discogs
      return new Response(JSON.stringify(body ?? {}), { status: 200 })
    }),
  )
}

beforeEach(() => {
  settings.discogsToken = ''
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('identification par code-barres', () => {
  it('regroupe les 17 éditions en un seul album, sans Discogs', async () => {
    mockFetch({ mb: mbRubberSoul })
    const r = await identifyBarcode('0077774644020')
    expect(r.state).toBe('trouve')
    expect(r.candidates).toHaveLength(1)
    const d = r.candidates[0].draft
    expect(d.artist).toBe('The Beatles')
    expect(d.artistSort).toBe('Beatles, The')
    expect(d.title).toBe('Rubber Soul')
    expect(d.format).toBe('standard')
    expect(d.thicknessMm).toBe(10.4)
    expect(d.label).toBe('Parlophone')
    expect(d.barcode).toBe('0077774644020')
    expect(d.coverUrls[0]).toContain('coverartarchive.org/release/')
    // 65 (MusicBrainz) + 20 (un seul album) ; genre connu via les tags
    expect(d.confidence).toBe(85)
    expect(d.status).toBe('identifie')
  })

  it('monte à 95 % quand Discogs confirme, et prend ses genres', async () => {
    settings.discogsToken = 'jeton-de-test'
    mockFetch({ mb: mbRubberSoul, discogs: { results: [discogsRubberSoul] } })
    const d = (await identifyBarcode('077774644020')).candidates[0].draft
    expect(d.confidence).toBe(95)
    expect(d.genres).toEqual(['Rock'])
    expect(d.styles).toEqual(['Pop Rock', 'Beat'])
    expect(d.discogsMasterId).toBe(46402)
    expect(d.coverUrls.at(-1)).toBe('https://i.discogs.com/rubber.jpg')
  })

  it('passe en « à vérifier » quand Discogs propose un autre album', async () => {
    settings.discogsToken = 'jeton-de-test'
    mockFetch({
      mb: mbRubberSoul,
      discogs: { results: [{ ...discogsRubberSoul, title: 'Johnny Hallyday - Rock à Memphis' }] },
    })
    const d = (await identifyBarcode('077774644020')).candidates[0].draft
    expect(d.confidence).toBe(70)
    expect(d.status).toBe('a_verifier')
    expect(d.confidenceReasons).toContain('Discogs propose un autre album')
  })

  it('utilise Discogs seul quand MusicBrainz ne connaît pas le code', async () => {
    settings.discogsToken = 'jeton-de-test'
    mockFetch({ mb: { releases: [] }, discogs: { results: [discogsRubberSoul] } })
    const r = await identifyBarcode('077774644020')
    expect(r.state).toBe('trouve')
    expect(r.candidates[0].draft.source).toBe('discogs')
    expect(r.candidates[0].draft.artistSort).toBe('Beatles, The')
    expect(r.candidates[0].draft.confidence).toBe(80)
  })

  it('demande de choisir quand deux albums différents ont le même code', async () => {
    const other = structuredClone(mbRubberSoul.releases[0]) as (typeof mbRubberSoul.releases)[0]
    other.id = 'autre-edition'
    other.title = 'Revolver'
    other['release-group'].id = 'autre-album'
    mockFetch({ mb: { releases: [mbRubberSoul.releases[0], other] } })
    const r = await identifyBarcode('077774644020')
    expect(r.state).toBe('a_choisir')
    expect(r.candidates).toHaveLength(2)
    expect(r.candidates[0].draft.status).toBe('a_verifier')
  })

  it('met en « à vérifier » un résultat MusicBrainz seul et sans genre', async () => {
    const bare = { ...mbRubberSoul.releases[0], tags: [] }
    mockFetch({ mb: { releases: [bare] } })
    const d = (await identifyBarcode('077774644020')).candidates[0].draft
    expect(d.confidence).toBe(75)
    expect(d.status).toBe('a_verifier')
  })

  it('signale un code inconnu partout', async () => {
    mockFetch({ mb: { releases: [] } })
    const r = await identifyBarcode('5099902987125')
    expect(r.state).toBe('introuvable')
    expect(r.candidates).toHaveLength(0)
  })
})
