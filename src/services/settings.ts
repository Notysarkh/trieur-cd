import { reactive } from 'vue'
import { db } from '../db/database'
import { defaultBookRules, defaultGameRules, defaultRules, defaultVideoRules, migrateRules, type ClassificationRules } from '../classification/themes'
import { DEFAULT_THICKNESS, type ThicknessTable } from '../lib/formats'
import type { MediaKind } from '../lib/media'
import type { Platform } from '../db/types'
import { DEFAULT_LAYOUT_OPTIONS, defaultFurniture, type Furniture, type LayoutOptions } from '../layout/furniture'

// Les réglages de l'appli, gardés dans la base locale.
// Le jeton Discogs est saisi dans l'écran Réglages : il n'est JAMAIS écrit dans le code,
// et il n'est pas inclus dans les sauvegardes (exports).

export interface Settings {
  /** Dernier univers ouvert (rouvert au démarrage) ; vide = jamais choisi, on montre l'accueil. */
  lastMedia: MediaKind | ''
  discogsToken: string
  /** Clé personnelle TMDB (films) : comme le jeton Discogs, jamais dans le code ni dans les sauvegardes. */
  tmdbKey: string
  /** Clé personnelle RAWG (jeux vidéo) : jamais dans le code ni dans les sauvegardes. */
  rawgKey: string
  thickness: ThicknessTable
  /** Mode rafale : la caméra reste allumée et les scans s'enchaînent. */
  burstMode: boolean
  /** Son et vibration à chaque code lu. */
  feedback: boolean
  /** Fiche « Où le ranger » : nombre de CD affichés avant et après dans la liste théorique. */
  whereWindow: number
  /** Règles de classement (thèmes, artistes forcés…). */
  classification: ClassificationRules
  /** Date du dernier classement appliqué (0 = jamais). */
  classificationAppliedAt: number
  /** Règles de classement des livres / BD (v2). */
  bookClassification: ClassificationRules
  bookClassificationAppliedAt: number
  /** Règles de classement des DVD / Blu-ray (v2). */
  videoClassification: ClassificationRules
  videoClassificationAppliedAt: number
  /** Règles de classement des jeux vidéo (v2) : une console par thème. */
  gameClassification: ClassificationRules
  gameClassificationAppliedAt: number
  /** Console choisie sur l'écran Scanner (jeux dont la notice n'indique pas la console). */
  scanPlatform: Platform | ''
  /** Les meubles, dans l'ordre de remplissage (le premier est rempli en premier). */
  furniture: Furniture[]
  /** Options de répartition (marge de croissance…). */
  layout: LayoutOptions
  /** Date de la dernière répartition appliquée (0 = jamais). */
  layoutAppliedAt: number
}

const DEFAULTS: Settings = {
  lastMedia: '',
  discogsToken: '',
  tmdbKey: '',
  rawgKey: '',
  thickness: { ...DEFAULT_THICKNESS },
  burstMode: true,
  feedback: true,
  whereWindow: 2,
  classification: defaultRules(),
  classificationAppliedAt: 0,
  bookClassification: defaultBookRules(),
  bookClassificationAppliedAt: 0,
  videoClassification: defaultVideoRules(),
  videoClassificationAppliedAt: 0,
  gameClassification: defaultGameRules(),
  gameClassificationAppliedAt: 0,
  scanPlatform: '',
  furniture: defaultFurniture(),
  layout: { ...DEFAULT_LAYOUT_OPTIONS },
  layoutAppliedAt: 0,
}

/** Les réglages en mémoire ; l'interface se met à jour toute seule quand ils changent. */
export const settings = reactive<Settings>(structuredClone(DEFAULTS))

let loaded: Promise<void> | null = null

/** Charge les réglages depuis la base (une seule fois). */
export function loadSettings(): Promise<void> {
  loaded ??= (async () => {
    const rows = await db.settings.toArray()
    for (const row of rows) {
      if (row.key in DEFAULTS) (settings as Record<string, unknown>)[row.key] = row.value
    }
    // Si un nouveau format a été ajouté depuis, on complète avec la valeur par défaut.
    settings.thickness = { ...DEFAULT_THICKNESS, ...settings.thickness }
    // v1.2 : boîtier double épais mesuré à 22 mm (au lieu des 24 mm estimés).
    if (settings.thickness.double === 24) await saveSetting('thickness', { ...settings.thickness, double: 22 })
    // v1.2 : règles de classement mises à jour (BO & jeux vidéo, musique française, Folk avec le Monde).
    const migrated = migrateRules(settings.classification)
    if (migrated) {
      // Thème choisi sur la fiche d'un CD : il suit le thème fusionné (Folk / Country → Musiques du monde).
      if (!migrated.themes.some((t) => t.id === 'folk') && migrated.themes.some((t) => t.id === 'monde')) {
        await db.cds.filter((c) => c.themeOverride === 'folk').modify({ themeOverride: 'monde' })
      }
      await saveSetting('classification', migrated)
    }
  })()
  return loaded
}

type RulesKey = 'classification' | 'bookClassification' | 'videoClassification' | 'gameClassification'
type AppliedAtKey = `${RulesKey}AppliedAt`
const RULES_KEYS: Record<MediaKind, RulesKey> = {
  cd: 'classification',
  livre: 'bookClassification',
  video: 'videoClassification',
  jeu: 'gameClassification',
}

/** Les règles de classement d'un univers. */
export function rulesFor(media: MediaKind): ClassificationRules {
  return settings[RULES_KEYS[media]]
}

/** Le réglage qui garde les règles de classement d'un univers. */
export function rulesKey(media: MediaKind): RulesKey {
  return RULES_KEYS[media]
}

/** Le réglage qui garde la date du dernier classement appliqué dans un univers. */
export function appliedAtKey(media: MediaKind): AppliedAtKey {
  return `${RULES_KEYS[media]}AppliedAt`
}

/** Date du dernier classement appliqué dans un univers (0 = jamais). */
export function appliedAtFor(media: MediaKind): number {
  return settings[appliedAtKey(media)]
}

/** L'univers en cours (CD par défaut). */
export function currentMedia(): MediaKind {
  return settings.lastMedia || 'cd'
}

/** Modifie et enregistre un réglage. */
export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  settings[key] = value
  // La copie JSON retire la « réactivité » de Vue, que la base ne sait pas stocker.
  await db.settings.put({ key, value: JSON.parse(JSON.stringify(value)) })
}
