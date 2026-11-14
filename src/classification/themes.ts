// Les thèmes de classement et les règles modifiables.
//
// HYPOTHÈSE IMPORTANTE — correspondance genres → thèmes :
// chaque thème a une liste de « mots-clés ». Un genre ou style d'un CD (ex. « Pop Rock »)
// est rattaché au thème dont un mot-clé lui correspond exactement ; sinon au thème dont
// le mot-clé contenu dans le genre est le plus long (« pop rock » contient « pop » et « rock »,
// mais « pop rock » est lui-même un mot-clé du thème Rock → Rock).
// Ces listes sont un point de départ : tout est modifiable dans l'écran « Thèmes ».

/** Thèmes au comportement particulier. */
export type SpecialTheme = 'compilations' | 'bo' | 'classique' | 'enfants' | 'francaise' | 'divers'

/** Ordre de rangement des CD à l'intérieur d'un thème. */
export type ThemeSort = 'artiste' | 'titre' | 'compositeur'

export interface ThemeDef {
  id: string
  name: string
  color: string
  /** Genres/styles (en minuscules, sans accents) qui mènent à ce thème. */
  keywords: string[]
  sortBy: ThemeSort
  /** Thème qui l'absorbe automatiquement s'il contient trop peu de CD (vide = jamais regroupé). */
  mergeInto?: string
  special?: SpecialTheme
}

export interface ClassificationRules {
  /** Version des règles (pour les mettre à jour automatiquement quand l'appli évolue). */
  version?: number
  /** Les thèmes, dans l'ordre de rangement (gauche → droite, haut → bas). */
  themes: ThemeDef[]
  /** Nombre maximum de thèmes : au-delà, les plus petits sont regroupés. */
  maxThemes: number
  /** Un thème avec moins de CD que ce nombre est regroupé dans son thème parent. */
  minCdsPerTheme: number
  /** Thème « Musique française » : les artistes francophones y vont, quel que soit leur genre. */
  frenchTheme: boolean
  /** Artistes forcés dans un thème : clé d'artiste → identifiant du thème. */
  artistOverrides: Record<string, string>
  /** Compilations forcées dans un thème : identifiant du CD → identifiant du thème. */
  cdOverrides: Record<string, string>
}

/** Identifiant réservé aux artistes dont on ne connaît pas le genre. */
export const UNCLASSIFIED = 'a_classer'

export const THEME_COLORS = [
  '#c0392b', '#7f8c8d', '#e67e22', '#2e86de', '#8e44ad', '#16a085', '#d35400',
  '#b7950b', '#27ae60', '#1abc9c', '#6c5ce7', '#34495e', '#e84393', '#f39c12', '#95a5a6',
]

export const RULES_VERSION = 2
const BO_NAME = 'BO films & jeux vidéo'
/** Mots-clés des musiques de films, de jeux vidéo et d'anime (vus dans ta collection). */
const GAME_KEYWORDS = [
  'soundtrack', 'video game music', 'video game', 'vgm', 'game', 'game music', 'game arrange', 'anime', 'anison', 'ost',
]

export function defaultRules(): ClassificationRules {
  const t = (
    id: string,
    name: string,
    color: string,
    keywords: string[],
    extra: Partial<ThemeDef> = {},
  ): ThemeDef => ({ id, name, color, keywords, sortBy: 'artiste', ...extra })

  return {
    version: RULES_VERSION,
    maxThemes: 16,
    minCdsPerTheme: 5,
    frenchTheme: true,
    artistOverrides: {},
    cdOverrides: {},
    themes: [
      t('rock', 'Rock', '#c0392b', [
        'rock', 'pop rock', 'punk', 'punk rock', 'indie rock', 'alternative rock', 'grunge', 'new wave', 'post punk',
        'garage rock', 'psychedelic rock', 'prog rock', 'progressive rock', 'classic rock', 'blues rock',
        'rock and roll', 'rockabilly', 'britpop', 'shoegaze', 'emo', 'indie', 'alternative', 'art rock', 'krautrock',
        'surf', 'folk rock', 'power pop', 'glam', 'glam rock', 'arena rock', 'rock opera', 'latin rock',
      ]),
      t('metal', 'Metal / Hard rock', '#7f8c8d', [
        'metal', 'heavy metal', 'hard rock', 'thrash', 'death metal', 'black metal', 'doom metal', 'power metal',
        'nu metal', 'metalcore', 'speed metal', 'glam metal', 'stoner rock', 'sludge metal', 'grindcore',
        'industrial metal', 'progressive metal',
      ], { mergeInto: 'rock' }),
      t('pop', 'Pop', '#e67e22', [
        'pop', 'synth pop', 'synthpop', 'europop', 'ballad', 'vocal', 'soft rock', 'easy listening', 'schlager',
        'dance pop', 'teen pop', 'chanson', 'variete', 'j pop', 'k pop', 'adult contemporary', 'new romantic',
        'baroque pop', 'chamber pop',
      ], { mergeInto: 'rock' }),
      t('francaise', 'Musique française', '#2e86de', [
        'chanson', 'chanson francaise', 'variete francaise', 'french pop', 'nouvelle chanson francaise',
      ], { special: 'francaise' }),
      t('electro', 'Électro', '#8e44ad', [
        'electronic', 'electro', 'house', 'techno', 'trance', 'ambient', 'downtempo', 'trip hop', 'drum n bass',
        'drum and bass', 'idm', 'dubstep', 'breakbeat', 'electronica', 'french house', 'big beat', 'synthwave',
        'edm', 'eurodance', 'dance', 'industrial', 'electropop', 'chillout', 'lounge',
      ], { mergeInto: 'pop' }),
      t('hiphop', 'Hip-hop / Rap', '#16a085', [
        'hip hop', 'rap', 'trap', 'gangsta', 'conscious', 'boom bap', 'french hip hop', 'pop rap',
        'instrumental hip hop', 'cloud rap', 'hardcore hip hop',
      ], { mergeInto: 'soul' }),
      t('soul', 'Soul / Funk / R&B', '#d35400', [
        'funk soul', 'soul', 'funk', 'rhythm and blues', 'r and b', 'rnb', 'contemporary r and b', 'disco', 'gospel',
        'motown', 'neo soul', 'northern soul', 'p funk', 'new jack swing',
      ], { mergeInto: 'pop' }),
      t('jazz', 'Jazz / Blues', '#b7950b', [
        'jazz', 'bebop', 'hard bop', 'cool jazz', 'swing', 'big band', 'fusion', 'jazz funk', 'jazz rock', 'free jazz',
        'modal', 'soul jazz', 'smooth jazz', 'vocal jazz', 'latin jazz', 'contemporary jazz', 'blues', 'delta blues',
        'chicago blues', 'electric blues', 'country blues', 'piano blues',
      ]),
      t('folk', 'Folk / Country', '#27ae60', [
        'folk', 'country', 'bluegrass', 'americana', 'singer songwriter', 'contemporary folk', 'country rock',
        'acoustic', 'alt country', 'folk pop', 'indie folk',
      ], { mergeInto: 'rock' }),
      t('monde', 'Musiques du monde', '#1abc9c', [
        'folk world and country', 'world', 'world music', 'latin', 'latin pop', 'reggae', 'ska', 'dub', 'dancehall',
        'salsa', 'cumbia', 'flamenco', 'bossa nova', 'samba', 'mpb', 'african', 'afrobeat', 'afro cuban', 'celtic',
        'fado', 'tango', 'zouk', 'rai', 'klezmer', 'reggaeton', 'bolero', 'rumba',
      ], { mergeInto: 'divers' }),
      t('classique', 'Classique', '#6c5ce7', [
        'classical', 'baroque', 'romantic', 'opera', 'modern classical', 'contemporary classical', 'chamber music',
        'symphony', 'choral', 'early music', 'medieval', 'renaissance', 'impressionist', 'orchestral', 'classique',
        'post romantic', 'neo romantic', 'art song', 'lieder',
      ], { special: 'classique', sortBy: 'compositeur' }),
      t('bo', BO_NAME, '#34495e', ['stage and screen', 'score', 'film score', 'musical', 'original score',
        'bande originale', 'film soundtrack', ...GAME_KEYWORDS], { special: 'bo', sortBy: 'titre' }),
      t('enfants', 'Enfants', '#e84393', [
        'children s', 'childrens', 'children s music', 'nursery rhymes', 'comptines', 'educational', 'lullaby',
      ], { special: 'enfants' }),
      t('compilations', 'Compilations / Multi-artistes', '#f39c12', [], { special: 'compilations', sortBy: 'titre' }),
      t('divers', 'Divers', '#95a5a6', [
        'non music', 'brass and military', 'spoken word', 'comedy', 'field recording', 'audiobook', 'poetry',
        'humour', 'military', 'new age', 'experimental', 'noise',
      ], { special: 'divers' }),
    ],
  }
}

/** Crée un identifiant de thème lisible à partir de son nom. */
export function themeIdFromName(name: string, existing: string[]): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'theme'
  let id = base
  for (let i = 2; existing.includes(id); i++) id = `${base}-${i}`
  return id
}

// ---------------------------------------------------------------------------
// Mise à jour des règles enregistrées (v1.2)
// ---------------------------------------------------------------------------

/**
 * Met à jour des règles enregistrées avec une ancienne version de l'appli, sans perdre tes réglages :
 * v2 = thème BO renommé « BO films & jeux vidéo » + mots-clés jeux vidéo / anime ; thème « Musique française » activé.
 * Renvoie null si rien n'a changé.
 */
export function migrateRules(rules: ClassificationRules): ClassificationRules | null {
  if ((rules.version ?? 1) >= RULES_VERSION) return null
  const r: ClassificationRules = JSON.parse(JSON.stringify(rules))
  const bo = r.themes.find((t) => t.special === 'bo')
  if (bo) {
    if (bo.name === 'BO de films') bo.name = BO_NAME
    for (const k of GAME_KEYWORDS) if (!bo.keywords.includes(k)) bo.keywords.push(k)
  }
  r.frenchTheme = true
  // Avec le thème « Musique française » en plus, 12 thèmes ne suffisent plus : Metal, Soul et Hip-hop
  // seraient regroupés automatiquement alors qu'ils sont déjà séparés sur tes étagères.
  if (r.maxThemes === 12) r.maxThemes = 16
  if (!r.themes.some((t) => t.special === 'francaise')) {
    // Thème supprimé auparavant : on le remet à sa place par défaut (après Pop).
    const fr = defaultRules().themes.find((t) => t.special === 'francaise')!
    const after = r.themes.findIndex((t) => t.id === 'pop')
    r.themes.splice(after < 0 ? 0 : after + 1, 0, fr)
  }
  r.version = RULES_VERSION
  return r
}
