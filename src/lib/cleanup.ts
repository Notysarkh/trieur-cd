// Petits nettoyages de données, appliqués aux nouveaux CD et une fois à toute la collection (v1.2).

/**
 * Étiquette MusicBrainz « parasite » : saisie libre d'un contributeur qui n'est pas un genre
 * (ex. « Fix Pseudo-Releases », « No Isrc », « Buyee Mercari », « 11.60€ », « 2026 », « Rayé »).
 */
export function isJunkTag(tag: string): boolean {
  const t = tag.trim()
  if (!t || t.length > 30) return true
  if (/\d/.test(t) || /[€$£]/.test(t)) return true
  // (?<!\p{L}) … (?!\p{L}) : « mot entier », y compris avec des lettres accentuées (« Rayé »).
  return /(?<!\p{L})(fix(me)?|pseudo|releases?|isrc|credits?|buyee|mercari|ray[ée]|owned|wishlist|seen live|favou?rites?|my collection)(?!\p{L})/iu.test(t)
}

/** Garde les vrais genres/styles d'une liste. */
export function cleanTags(tags: string[]): string[] {
  return tags.filter((t) => !isJunkTag(t))
}

/** Le texte n'utilise-t-il que l'alphabet latin (avec accents) ? */
export function isLatin(text: string): boolean {
  return /^[\p{Script=Latin}\p{N}\p{P}\p{S}\p{Zs}\p{M}]*$/u.test(text)
}

/** « Uematsu, Nobuo » → « Nobuo Uematsu » ; « Beatles, The » → « The Beatles ». */
export function uninvertSortName(sortName: string): string {
  const i = sortName.indexOf(', ')
  if (i < 0) return sortName
  return `${sortName.slice(i + 2)} ${sortName.slice(0, i)}`.trim()
}

/**
 * Nom d'artiste lisible : si l'artiste est écrit dans un autre alphabet (ex. « 植松伸夫 »)
 * et que son nom de tri est en lettres latines (« Uematsu, Nobuo »), on affiche « Nobuo Uematsu ».
 * Renvoie null si rien n'est à changer.
 */
export function latinArtistName(artist: string, artistSort: string | undefined): string | null {
  if (isLatin(artist) || !artistSort || !isLatin(artistSort)) return null
  return uninvertSortName(artistSort)
}
