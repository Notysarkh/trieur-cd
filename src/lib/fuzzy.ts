import { normalizeText } from './text'

// Recherche « tolérante » : ignore les majuscules et les accents, et accepte une petite faute de frappe.
// Ex. « beatls » trouve « The Beatles », « brasens copain » trouve « Brassens — Les Copains d'abord ».

/** Nombre de modifications (lettre ajoutée, retirée ou changée) pour passer d'un mot à l'autre. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

/** Fautes tolérées selon la longueur du mot tapé : aucune sous 4 lettres, 1 jusqu'à 6, 2 au-delà. */
const allowed = (len: number) => (len < 4 ? 0 : len < 7 ? 1 : 2)

/**
 * Score de ressemblance entre une recherche et un texte (plus petit = meilleur), ou null si ça ne correspond pas.
 * Chaque mot tapé doit se retrouver dans le texte : au début d'un mot (« beat » → « beatles »),
 * à l'intérieur d'un mot, ou avec une petite faute.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = normalizeText(query).split(' ').filter(Boolean)
  if (!q.length) return 0
  const words = normalizeText(text).split(' ').filter(Boolean)
  let score = 0
  for (const term of q) {
    let best = Infinity
    for (const w of words) {
      if (w.startsWith(term)) best = Math.min(best, 0)
      else if (w.includes(term)) best = Math.min(best, 1)
      else if (term.length >= 4) {
        // Faute de frappe : on compare au mot entier, ou à son début (recherche en cours de frappe).
        const d = Math.min(editDistance(term, w), editDistance(term, w.slice(0, term.length)))
        if (d <= allowed(term.length)) best = Math.min(best, 2 + d)
      }
      if (best === 0) break
    }
    if (best === Infinity) return null
    score += best
  }
  return score
}

/** Filtre et trie une liste selon la recherche (les meilleures correspondances d'abord). */
export function fuzzyFilter<T>(items: T[], query: string, textOf: (item: T) => string): T[] {
  if (!normalizeText(query)) return items
  return items
    .map((item, i) => ({ item, i, score: fuzzyScore(query, textOf(item)) }))
    .filter((x): x is { item: T; i: number; score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map((x) => x.item)
}
