import type { Cd } from '../db/types'

// Quand on réapplique le rangement, quels CD déjà posés peuvent RESTER où ils sont ?
//
// Un CD rangé qui reste dans la même rangée n'a pas besoin d'être déplacé… à condition que l'ordre
// des CD rangés de cette rangée reste le même. Exemple : rangée « A B C D », nouveau plan « A C B D » :
// il suffit de déplacer B (ou C), pas tous. On garde donc la plus longue suite de CD déjà dans le bon ordre
// (« plus longue sous-suite croissante ») ; seuls les autres repassent « à ranger ».

/** Indices des éléments formant la plus longue sous-suite strictement croissante. */
function longestIncreasing(values: number[]): Set<number> {
  const tails: number[] = [] // indice du dernier élément de la meilleure suite de chaque longueur
  const prev: number[] = new Array(values.length).fill(-1)
  for (let i = 0; i < values.length; i++) {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (values[tails[mid]] < values[i]) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[i] = tails[lo - 1]
    tails[lo] = i
  }
  const keep = new Set<number>()
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) keep.add(k)
  return keep
}

/**
 * Les CD rangés qui gardent leur statut « rangé » avec le nouveau placement :
 * même rangée, et ordre relatif conservé.
 */
export function shelvedToKeep(cds: Cd[], placement: Map<string, { slotId: string; position: number }>): Set<string> {
  const bySlot = new Map<string, Cd[]>()
  for (const cd of cds) {
    const p = placement.get(cd.id)
    if (!cd.shelvedAt || !cd.location || !p || p.slotId !== cd.location.slotId) continue
    bySlot.set(p.slotId, [...(bySlot.get(p.slotId) ?? []), cd])
  }
  const keep = new Set<string>()
  for (const list of bySlot.values()) {
    list.sort((a, b) => a.location!.position - b.location!.position) // ordre physique actuel
    const newPositions = list.map((cd) => placement.get(cd.id)!.position)
    for (const i of longestIncreasing(newPositions)) keep.add(list[i].id)
  }
  return keep
}
