import { reactive } from 'vue'
import { db } from '../db/database'
import { defaultRules, type ClassificationRules } from '../classification/themes'
import { DEFAULT_THICKNESS, type ThicknessTable } from '../lib/formats'
import { DEFAULT_LAYOUT_OPTIONS, defaultFurniture, type Furniture, type LayoutOptions } from '../layout/furniture'

// Les réglages de l'appli, gardés dans la base locale.
// Le jeton Discogs est saisi dans l'écran Réglages : il n'est JAMAIS écrit dans le code,
// et il n'est pas inclus dans les sauvegardes (exports).

export interface Settings {
  discogsToken: string
  thickness: ThicknessTable
  /** Mode rafale : la caméra reste allumée et les scans s'enchaînent. */
  burstMode: boolean
  /** Son et vibration à chaque code lu. */
  feedback: boolean
  /** Règles de classement (thèmes, artistes forcés…). */
  classification: ClassificationRules
  /** Date du dernier classement appliqué (0 = jamais). */
  classificationAppliedAt: number
  /** Les meubles, dans l'ordre de remplissage (le premier est rempli en premier). */
  furniture: Furniture[]
  /** Options de répartition (marge de croissance…). */
  layout: LayoutOptions
  /** Date de la dernière répartition appliquée (0 = jamais). */
  layoutAppliedAt: number
}

const DEFAULTS: Settings = {
  discogsToken: '',
  thickness: { ...DEFAULT_THICKNESS },
  burstMode: true,
  feedback: true,
  classification: defaultRules(),
  classificationAppliedAt: 0,
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
  })()
  return loaded
}

/** Modifie et enregistre un réglage. */
export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  settings[key] = value
  // La copie JSON retire la « réactivité » de Vue, que la base ne sait pas stocker.
  await db.settings.put({ key, value: JSON.parse(JSON.stringify(value)) })
}
