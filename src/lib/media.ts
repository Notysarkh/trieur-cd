// Les « univers » de Mediamwa : chaque type de média a sa propre collection, ses écrans et ses règles.
// Une fiche sans univers (créée avant la v2) est un CD.

export type MediaKind = 'cd' | 'video' | 'livre' | 'jeu'

export interface MediaInfo {
  id: MediaKind
  icon: string
  /** Nom de l'univers (« Livres / BD »). */
  label: string
  /** Un objet de cet univers, au singulier et au pluriel (« CD », « livre »…). */
  one: string
  many: string
  /** Qui l'a créé, pour les textes (« artiste », « auteur »…), au singulier et au pluriel. */
  creator: string
  creators: string
  /** Étape de la v2 qui ajoute le scan, le classement et le rangement de cet univers ; absent = prêt. */
  comingInStep?: string
}

export const MEDIA: MediaInfo[] = [
  { id: 'cd', icon: '💿', label: 'CD', one: 'CD', many: 'CD', creator: 'artiste', creators: 'artistes' },
  { id: 'livre', icon: '📚', label: 'Livres / BD', one: 'livre', many: 'livres', creator: 'auteur ou série', creators: 'auteurs et séries' },
  { id: 'video', icon: '🎬', label: 'DVD / Blu-ray', one: 'film', many: 'films', creator: 'film ou série', creators: 'films et séries' },
  { id: 'jeu', icon: '🎮', label: 'Jeux vidéo', one: 'jeu', many: 'jeux', creator: 'jeu', creators: 'jeux' },
]

export function mediaInfo(id: MediaKind): MediaInfo {
  return MEDIA.find((m) => m.id === id) ?? MEDIA[0]
}

/** L'univers d'une fiche (les fiches d'avant la v2 sont des CD). */
export function mediaOf(item: { media?: MediaKind }): MediaKind {
  return item.media ?? 'cd'
}
