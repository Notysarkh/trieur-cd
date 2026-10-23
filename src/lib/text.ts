// Petits outils pour comparer des textes (titres, noms d'artistes).

/** Met en minuscules, retire les accents et la ponctuation. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Retire les mentions d'édition qui varient d'une base à l'autre : (Remastered), [Deluxe Edition]… */
export function stripEditionNotes(title: string): string {
  return title.replace(/\s*[([][^)\]]*(remaster|edition|deluxe|version|bonus|anniversary|mono|stereo)[^)\]]*[)\]]/gi, '')
}

/**
 * Ressemblance entre deux textes, de 0 (rien à voir) à 1 (identiques).
 * On compare les paires de lettres qu'ils ont en commun (coefficient de Dice).
 */
export function similarity(a: string, b: string): number {
  const x = normalizeText(stripEditionNotes(a)).replace(/ /g, '')
  const y = normalizeText(stripEditionNotes(b)).replace(/ /g, '')
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.length < 2 || y.length < 2) return 0
  const pairs = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const p = s.slice(i, i + 2)
      m.set(p, (m.get(p) ?? 0) + 1)
    }
    return m
  }
  const px = pairs(x)
  const py = pairs(y)
  let common = 0
  for (const [p, n] of px) common += Math.min(n, py.get(p) ?? 0)
  return (2 * common) / (x.length - 1 + (y.length - 1))
}

/** Extrait l'année (4 chiffres) d'une date comme « 1987-04-30 ». */
export function yearFrom(date: string | number | undefined | null): number | undefined {
  if (date === undefined || date === null) return undefined
  const m = String(date).match(/(1[89]\d\d|20\d\d)/)
  return m ? Number(m[1]) : undefined
}

/** Met une majuscule au début de chaque mot (pour les genres MusicBrainz, écrits en minuscules). */
export function titleCase(s: string): string {
  return s.replace(/(^|[\s/-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase())
}
