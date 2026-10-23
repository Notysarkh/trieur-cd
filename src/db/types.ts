// Description des données manipulées par l'appli.
// Tout est stocké dans le navigateur (IndexedDB), rien ne part sur un serveur.

/** Où en est l'identification d'un CD de la collection. */
export type CdStatus =
  | 'identifie' // trouvé automatiquement avec une bonne confiance (ou confirmé par toi)
  | 'a_verifier' // trouvé mais douteux, ou pas trouvé du tout : à regarder
  | 'manuel' // saisi à la main

/** Format physique du boîtier : sert à estimer la place occupée dans les meubles. */
export type CdFormat =
  | 'standard' // boîtier cristal classique
  | 'slim' // boîtier fin
  | 'double' // boîtier double épais (« fatbox »)
  | 'digipak' // carton + plateau plastique
  | 'carton' // simple pochette carton
  | 'coffret' // box set
  | 'autre'

export type CdSource = 'musicbrainz' | 'discogs' | 'manuel'

/** Un CD de la collection. */
export interface Cd {
  id: string
  barcode?: string
  artist: string
  /** Nom utilisé pour le tri alphabétique, ex. « Beatles, The » ou « Brassens, Georges ». */
  artistSort: string
  title: string
  /** Année de première sortie de l'album (sert au tri chronologique des albums d'un artiste). */
  year?: number
  /** Année de cette édition précise (réédition, remaster…). */
  releaseYear?: number
  label?: string
  catalogNumber?: string
  country?: string
  /** Grands genres (ex. Rock, Jazz). */
  genres: string[]
  /** Styles plus fins (ex. Pop Rock, Bebop). */
  styles: string[]
  format: CdFormat
  discCount: number
  /** Épaisseur estimée en millimètres. */
  thicknessMm: number
  /** Adresses possibles de la pochette, essayées dans l'ordre. */
  coverUrls: string[]
  /** Photo de pochette prise avec le téléphone (petite image), si besoin. */
  coverPhoto?: string
  /** Vrai pour les compilations multi-artistes. */
  isCompilation: boolean
  /** Compositeur (musique classique) : sert de clé de tri dans le thème Classique. */
  composer?: string
  /** Langue des textes selon MusicBrainz (code ISO, ex. « fra », « eng »). */
  language?: string
  /** Types secondaires de l'album selon MusicBrainz (ex. « Soundtrack », « Live », « Compilation »). */
  releaseTypes?: string[]
  status: CdStatus
  /** Indice de confiance de 0 à 100. */
  confidence: number
  /** Explications lisibles de l'indice de confiance. */
  confidenceReasons: string[]
  source: CdSource
  mbReleaseId?: string
  mbReleaseGroupId?: string
  mbArtistId?: string
  discogsReleaseId?: number
  discogsMasterId?: number
  /** Date de la récupération des détails de l'édition sur MusicBrainz (langue, type d'album). */
  mbDetailsCheckedAt?: number
  /** Date de la dernière recherche Discogs par artiste + titre (pour ne pas la refaire). */
  discogsCheckedAt?: number
  /** Thème attribué lors du dernier classement appliqué. */
  themeId?: string
  /** Rang du CD dans l'ordre de rangement global (0 = premier CD du premier thème). */
  shelfOrder?: number
  /** Emplacement dans les meubles (rempli à l'étape 3). */
  location?: { furnitureId: string; slotId: string; position: number }
  /** Date à laquelle le CD a été physiquement posé à son emplacement (mode rangement du scanner). */
  shelvedAt?: number
  notes?: string
  createdAt: number
  updatedAt: number
}

/** Les informations d'un CD avant qu'il soit enregistré dans la collection. */
export type CdDraft = Omit<Cd, 'id' | 'createdAt' | 'updatedAt' | 'location'>

/** Les éléments qui composent l'indice de confiance (voir services/identify.ts). */
export interface ConfidenceFactors {
  /** Base qui a reconnu le code-barres. */
  source: 'musicbrainz' | 'discogs'
  /** Nombre d'albums différents qui portent ce code-barres. */
  albumsForBarcode: number
  /** Avis de Discogs sur cette proposition. */
  discogs: 'confirme' | 'contredit' | 'absent' | 'non_configure' | 'indisponible' | 'source'
  hasGenre: boolean
}

/** Une proposition d'identification (il peut y en avoir plusieurs pour un même code-barres). */
export interface Candidate {
  /** Identifiant unique de la proposition, ex. « mb:<id> » ou « dg:<id> ». */
  key: string
  draft: CdDraft
  /** Vrai une fois les détails complémentaires récupérés (année d'origine, genres…). */
  enriched: boolean
  /** Absent pour les résultats d'une recherche texte (c'est toi qui choisis). */
  factors?: ConfidenceFactors
}

/** État d'un code-barres dans la file d'attente du scan en rafale. */
export type ScanState =
  | 'en_attente' // pas encore cherché (ex. hors connexion)
  | 'recherche' // recherche en cours
  | 'trouve' // une proposition fiable est prête
  | 'a_choisir' // plusieurs albums possibles : à toi de choisir
  | 'introuvable' // aucune base ne connaît ce code-barres
  | 'erreur' // problème réseau ou service indisponible

export interface ScanItem {
  id: string
  barcode: string
  scannedAt: number
  state: ScanState
  candidates: Candidate[]
  /** La proposition retenue (choisie automatiquement ou par toi). */
  chosenKey?: string
  /** Vrai si tu as choisi toi-même parmi plusieurs propositions. */
  chosenByUser: boolean
  /** CD déjà présents dans la collection avec le même code-barres. */
  duplicateOfIds: string[]
  /** Faut-il l'ajouter à la collection lors de la validation ? */
  include: boolean
  error?: string
  attempts: number
}

/** Informations sur un artiste récupérées sur MusicBrainz (mises en cache). */
export interface ArtistInfo {
  /** Identifiant MusicBrainz de l'artiste. */
  mbArtistId: string
  name: string
  /** Pays (code ISO, ex. « FR »). */
  country?: string
  genres: string[]
  tags: string[]
  fetchedAt: number
}

/** Une ligne de réglage (clé → valeur). */
export interface SettingRow {
  key: string
  value: unknown
}
