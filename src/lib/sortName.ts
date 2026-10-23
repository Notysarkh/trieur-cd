// Calcul du « nom de tri » d'un artiste, utilisé pour l'ordre alphabétique.
//
// HYPOTHÈSE : sans autre information, on sait seulement déplacer l'article en fin de nom
// (« The Beatles » → « Beatles, The », « Les Rita Mitsouko » → « Rita Mitsouko, Les »).
// On ne peut pas deviner si « Georges Brassens » est une personne (→ « Brassens, Georges ») :
// MusicBrainz fournit ce nom de tri quand il connaît l'artiste ; sinon tu peux le corriger à la main.

const ARTICLES = ['The', 'A', 'An', 'Les', 'Le', 'La']

export function guessSortName(artist: string): string {
  const name = artist.trim()
  // « L'Affaire Louis Trio » → « Affaire Louis Trio, L' »
  const elision = name.match(/^(L['’])(.+)$/i)
  if (elision) return `${elision[2].trim()}, ${elision[1]}`
  for (const article of ARTICLES) {
    const prefix = article + ' '
    if (name.length > prefix.length && name.toLowerCase().startsWith(prefix.toLowerCase())) {
      return `${name.slice(prefix.length).trim()}, ${name.slice(0, article.length)}`
    }
  }
  return name
}

/** Retire le numéro que Discogs ajoute pour distinguer les homonymes : « Nirvana (2) » → « Nirvana ». */
export function cleanDiscogsArtist(name: string): string {
  return name.replace(/\s*\(\d+\)$/, '').replace(/\*$/, '').trim()
}
