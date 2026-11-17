import type { Platform } from '../db/types'
import { PLATFORMS, platformFromText } from '../lib/platforms'
import { settings } from './settings'

// Reconnaissance des jeux vidéo sur une photo, par Claude (modèle Claude Haiku 5.5, choisi le 17/11/2026).
//
// - Une photo de jaquette (un jeu) ou d'une rangée de tranches (20 à 30 jeux d'un coup) : Claude lit les titres
//   et la console ; l'appli cherche ensuite chaque titre dans RAWG et la BnF.
// - Il faut une clé API Anthropic personnelle (payante, quelques centimes pour des centaines de photos), saisie dans
//   les Réglages : elle reste sur l'appareil (jamais dans le code, jamais dans les sauvegardes).
// - La photo est envoyée à Anthropic pour être lue ; rien n'est envoyé sans que tu prennes une photo.
// - Le SDK n'est chargé qu'au premier usage (il ne ralentit pas l'ouverture de l'appli).

export const VISION_MODEL = 'claude-haiku-5-5'

export function hasAnthropicKey(): boolean {
  return !!settings.anthropicKey.trim()
}

export interface SeenGame {
  /** Titre tel qu'écrit sur la boîte, sans mention d'édition (« Platinum », « Essentials »…). */
  title: string
  platform?: Platform
  /** Lecture sûre, probable ou incertaine (tranche abîmée, logo seulement…). */
  confidence: 'haute' | 'moyenne' | 'basse'
}

const KNOWN = PLATFORMS.filter((p) => p.id !== 'autre')
const CONSOLES = KNOWN.map((p) => `${p.id} = ${p.label}`).join(', ')

const SYSTEM = `Tu identifies des jeux vidéo physiques sur une photo prise par un collectionneur (jaquette de face, ou rangée de boîtes vues par la tranche).
Pour chaque jeu visible, donne :
- title : le titre du jeu tel qu'il est écrit sur la boîte (langue d'origine de la boîte), sans la console, sans les mentions d'édition ou de gamme (Platinum, Essentials, Player's Choice, Greatest Hits, Nintendo Selects, Classics, Best Of…), sans le nom de l'éditeur sauf s'il fait partie du titre ;
- platform : l'identifiant de la console parmi cette liste : ${CONSOLES} ; « inconnue » si rien ne permet de la reconnaître (bandeau de couleur, logo, forme et taille de la boîte, typographie de la tranche) ;
- confidence : « haute » si le titre est lisible en entier, « moyenne » si tu le déduis d'un titre partiel ou d'un logo connu, « basse » sinon.
Liste les jeux dans l'ordre de la photo (de gauche à droite, puis de haut en bas). N'invente pas de jeu : ignore ce qui n'est pas une boîte de jeu vidéo (films, livres, consoles, manettes). Si aucun jeu n'est visible, renvoie une liste vide.`

/** La console renvoyée par Claude : un identifiant connu, sinon lu dans le texte (« PS2 », « Game Boy »…). */
export function platformOf(value: string): Platform | undefined {
  const v = value.trim().toLowerCase()
  if (!v || v === 'inconnue') return undefined
  return KNOWN.find((p) => p.id === v)?.id ?? platformFromText(value)
}

/**
 * Lit les jeux d'une photo (data URL JPEG). `hint` : la console des jeux que tu scannes, si elle est choisie
 * (utile pour une rangée de tranches d'une seule console).
 */
export async function readGamesFromPhoto(dataUrl: string, hint?: Platform): Promise<SeenGame[]> {
  const [{ default: Anthropic }, { z }, { zodOutputFormat }] = await Promise.all([
    import('@anthropic-ai/sdk'),
    import('zod'),
    import('@anthropic-ai/sdk/helpers/zod'),
  ])
  const client = new Anthropic({ apiKey: settings.anthropicKey.trim(), dangerouslyAllowBrowser: true })
  const Games = z.object({
    games: z.array(
      z.object({
        title: z.string(),
        platform: z.string(),
        confidence: z.enum(['haute', 'moyenne', 'basse']),
      }),
    ),
  })
  const [header, data] = dataUrl.split(',', 2)
  const mediaType = /image\/png/.test(header) ? 'image/png' : 'image/jpeg'
  const hintText = hint ? ` Les jeux photographiés sont probablement sur ${PLATFORMS.find((p) => p.id === hint)?.label} (sauf indice contraire).` : ''
  const response = await client.messages.parse({
    model: VISION_MODEL,
    max_tokens: 8000,
    // Lecture simple : peu de réflexion suffit (moins cher, plus rapide).
    output_config: { effort: 'low', format: zodOutputFormat(Games) },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: `Quels jeux vidéo vois-tu sur cette photo ?${hintText}` },
        ],
      },
    ],
  })
  if (response.stop_reason === 'refusal') throw new Error('Claude a refusé de lire cette photo.')
  if (response.stop_reason === 'max_tokens') throw new Error('Trop de jeux sur une seule photo : photographie la rangée en deux fois.')
  const parsed = response.parsed_output
  if (!parsed) throw new Error("La réponse n'a pas pu être lue : réessaie.")
  return parsed.games
    .filter((g) => g.title.trim())
    .map((g) => ({ title: g.title.trim(), platform: platformOf(g.platform) ?? hint, confidence: g.confidence }))
}

/** Vérifie la clé (bouton « Tester » des Réglages) : une toute petite demande, sans image. */
export async function testAnthropicKey(): Promise<boolean> {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: settings.anthropicKey.trim(), dangerouslyAllowBrowser: true })
    await client.models.retrieve(VISION_MODEL)
    return true
  } catch {
    return false
  }
}
