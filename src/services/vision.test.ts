import { afterEach, describe, expect, it, vi } from 'vitest'

// Lecture des jeux sur photo : on simule la réponse de Claude (aucune vraie demande, aucun coût).
// Vérifie que le SDK et zod se chargent, le format de la demande, et la conversion de la réponse.

const parse = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    opts: unknown
    constructor(opts: unknown) {
      this.opts = opts
    }
    messages = { parse }
  },
}))

import { settings } from './settings'
import { readGamesFromPhoto, VISION_MODEL } from './vision'

afterEach(() => parse.mockReset())

describe('lecture des jeux sur photo (Claude simulé)', () => {
  it('envoie la photo à Claude Haiku 5.5 et convertit les consoles', async () => {
    settings.anthropicKey = 'sk-ant-test'
    parse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: {
        games: [
          { title: 'Ōkami', platform: 'ps2', confidence: 'haute' },
          { title: 'Pokémon Cristal', platform: 'Game Boy Color', confidence: 'moyenne' },
          { title: 'Tekken 3', platform: 'inconnue', confidence: 'haute' },
          { title: ' ', platform: 'ps1', confidence: 'basse' },
        ],
      },
    })
    const games = await readGamesFromPhoto('data:image/jpeg;base64,AAAA', 'ps1')
    expect(games).toEqual([
      { title: 'Ōkami', platform: 'ps2', confidence: 'haute' },
      { title: 'Pokémon Cristal', platform: 'gbc', confidence: 'moyenne' },
      // Console illisible : celle choisie à l'écran.
      { title: 'Tekken 3', platform: 'ps1', confidence: 'haute' },
    ])
    const req = parse.mock.calls[0][0]
    expect(req.model).toBe(VISION_MODEL)
    expect(VISION_MODEL).toBe('claude-haiku-5-5')
    expect(req.output_config.effort).toBe('low')
    expect(req.output_config.format).toBeTruthy()
    expect(req.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } })
    expect(req.messages[0].content[1].text).toMatch(/PlayStation 1/)
  })

  it('refus ou réponse coupée : un message clair', async () => {
    parse.mockResolvedValue({ stop_reason: 'refusal', parsed_output: null })
    await expect(readGamesFromPhoto('data:image/jpeg;base64,AAAA')).rejects.toThrow(/refusé/)
    parse.mockResolvedValue({ stop_reason: 'max_tokens', parsed_output: null })
    await expect(readGamesFromPhoto('data:image/jpeg;base64,AAAA')).rejects.toThrow(/deux fois/)
  })
})
