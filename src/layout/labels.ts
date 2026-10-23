import { titleSortKey } from '../classification/engine'
import type { ThemeDef } from '../classification/themes'
import type { Cd } from '../db/types'
import { buildSlots, type Furniture } from './furniture'

// Étiquettes intercalaires : « Rock — A à D », d'après les emplacements enregistrés.

/**
 * - « rangee » : une étiquette par thème et par rangée (ex. « Rock — A à D », puis « Rock — E à K »…) ;
 * - « lettre » : une étiquette par lettre dans chaque thème (« Rock — B ») ;
 * - « theme » : une seule étiquette par thème (« Rock — A à Z »).
 */
export type LabelMode = 'rangee' | 'lettre' | 'theme'

export interface DividerLabel {
  theme: ThemeDef
  /** Plage alphabétique, ex. « A à D » ou « B ». */
  range: string
  /** Où se trouve l'étiquette, ex. « Billy · niveau 2 · devant ». */
  where: string
  cdCount: number
}

/** Initiale utilisée pour le tri dans ce thème (artiste, titre ou compositeur). « # » pour les chiffres et symboles. */
export function sortLetter(cd: Cd, theme: ThemeDef | undefined): string {
  const key =
    theme?.sortBy === 'titre' || cd.isCompilation
      ? titleSortKey(cd.title)
      : theme?.sortBy === 'compositeur'
        ? cd.composer?.trim() || cd.artistSort || cd.artist
        : cd.artistSort || cd.artist
  const letter = key
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .charAt(0)
    .toUpperCase()
  return /[A-Z]/.test(letter) ? letter : '#'
}

export function buildLabels(
  cds: Cd[],
  furniture: Furniture[],
  themeOf: (cd: Cd) => ThemeDef,
  mode: LabelMode,
): DividerLabel[] {
  const slots = buildSlots(furniture)
  const slotIndex = new Map(slots.map((s, i) => [s.id, i]))
  // Les CD rangés, dans l'ordre physique : rangée après rangée, de gauche à droite.
  const ordered = cds
    .filter((c) => c.location && slotIndex.has(c.location.slotId))
    .sort(
      (a, b) =>
        slotIndex.get(a.location!.slotId)! - slotIndex.get(b.location!.slotId)! ||
        a.location!.position - b.location!.position,
    )

  const labels: DividerLabel[] = []
  const groupKey = (cd: Cd) => {
    const theme = themeOf(cd)
    if (mode === 'theme') return theme.id
    if (mode === 'lettre') return `${theme.id}|${sortLetter(cd, theme)}`
    return `${theme.id}|${cd.location!.slotId}`
  }
  let current: { key: string; cds: Cd[] } | null = null
  const flush = () => {
    if (!current) return
    const theme = themeOf(current.cds[0])
    const from = sortLetter(current.cds[0], theme)
    const to = sortLetter(current.cds.at(-1)!, theme)
    const firstSlot = slots[slotIndex.get(current.cds[0].location!.slotId)!]
    const lastSlot = slots[slotIndex.get(current.cds.at(-1)!.location!.slotId)!]
    labels.push({
      theme,
      range: from === to ? from : `${from} à ${to}`,
      where: firstSlot.id === lastSlot.id ? firstSlot.label : `${firstSlot.label} → ${lastSlot.label}`,
      cdCount: current.cds.length,
    })
  }
  for (const cd of ordered) {
    const key = groupKey(cd)
    if (current && current.key === key) current.cds.push(cd)
    else {
      flush()
      current = { key, cds: [cd] }
    }
  }
  flush()
  return labels
}
