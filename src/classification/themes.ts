import { MY_PLATFORMS, PLATFORMS } from '../lib/platforms'
import type { Platform } from '../db/types'

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
export type ThemeSort = 'artiste' | 'titre' | 'compositeur' | 'serie'

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

export const RULES_VERSION = 3
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

  const rules: ClassificationRules = {
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
  // Ton choix (14/11/2026) : Folk / Country rangé avec les Musiques du monde (ses mots-clés y passent).
  mergeThemeInto(rules, 'folk', 'monde')
  return rules
}

// ---------------------------------------------------------------------------
// Livres / BD (v2, étape B)
// ---------------------------------------------------------------------------

/**
 * Règles par défaut des livres : genre → auteur (nom de famille) → date ;
 * BD, mangas et comics à part, par série (A → Z) puis tome, les albums isolés par auteur.
 * HYPOTHÈSE : les genres sont devinés d'après la BnF (genre « Bandes dessinées », indice Dewey,
 * collection de l'éditeur, public jeunesse…) ; le reste se corrige par auteur ou sur la fiche.
 */
export function defaultBookRules(): ClassificationRules {
  const t = (id: string, name: string, color: string, keywords: string[], extra: Partial<ThemeDef> = {}): ThemeDef => ({
    id,
    name,
    color,
    keywords,
    sortBy: 'artiste',
    ...extra,
  })
  return {
    version: RULES_VERSION,
    maxThemes: 20,
    minCdsPerTheme: 0,
    frenchTheme: false,
    artistOverrides: {},
    cdOverrides: {},
    themes: [
      t('roman', 'Romans', '#c0392b', ['roman', 'romans', 'fiction', 'litterature', 'nouvelles', 'poesie', 'theatre']),
      t('polar', 'Polars / Thrillers', '#34495e', ['polar', 'policier', 'roman policier', 'romans policiers', 'thriller', 'noir', 'suspense', 'espionnage']),
      t('sf', 'SF / Fantasy', '#8e44ad', ['science fiction', 'sf', 'fantasy', 'fantastique', 'anticipation']),
      t('jeunesse', 'Jeunesse', '#e84393', ['jeunesse', 'enfants', 'livres pour enfants', 'album jeunesse']),
      t('histoire', 'Histoire', '#b7950b', ['histoire', 'biographie', 'memoires', 'geographie']),
      t('pratique', 'Pratique', '#27ae60', ['pratique', 'cuisine', 'bricolage', 'jardinage', 'sante', 'loisirs', 'sport', 'tourisme', 'guide']),
      t('beaux', 'Beaux livres', '#d35400', ['beaux livres', 'art', 'arts', 'photographie', 'architecture']),
      t('divers', 'Divers', '#95a5a6', ['essai', 'philosophie', 'sciences', 'religion', 'societe', 'dictionnaire', 'langues'], { special: 'divers' }),
      t('bd', 'BD', '#2e86de', ['bd', 'bandes dessinees', 'bande dessinee'], { sortBy: 'serie' }),
      t('manga', 'Mangas', '#16a085', ['manga', 'mangas'], { sortBy: 'serie' }),
      t('comics', 'Comics', '#e67e22', ['comics'], { sortBy: 'serie' }),
    ],
  }
}

/**
 * Règles par défaut des films (tous supports mélangés) : genre → titre (A → Z) ; les saisons d'une série restent ensemble.
 * Mots-clés : vocabulaire des genres de la BnF (« film policier, thriller, espionnage »…) et de TMDB (« Crime », « Familial »…).
 */
export function defaultVideoRules(): ClassificationRules {
  const t = (id: string, name: string, color: string, keywords: string[], extra: Partial<ThemeDef> = {}): ThemeDef => ({
    id,
    name,
    color,
    keywords,
    sortBy: 'serie',
    ...extra,
  })
  return {
    version: RULES_VERSION,
    maxThemes: 20,
    minCdsPerTheme: 0,
    frenchTheme: false,
    artistOverrides: {},
    cdOverrides: {},
    themes: [
      t('action', 'Action / Aventure', '#c0392b', ['action', 'aventure', 'aventures', 'film d aventures et d action', 'arts martiaux', 'western', 'film de guerre', 'guerre']),
      t('comedie', 'Comédie', '#e67e22', ['comedie', 'film burlesque', 'burlesque', 'comedie musicale']),
      t('drame', 'Drame', '#8e44ad', ['drame', 'film dramatique', 'film historique', 'histoire', 'biographie', 'romance']),
      t('policier', 'Policier / Thriller', '#34495e', ['policier', 'film policier', 'thriller', 'espionnage', 'crime', 'mystere']),
      t('sf', 'SF / Fantastique', '#2e86de', ['science fiction', 'film fantastique', 'fantastique', 'fantasy']),
      t('horreur', 'Horreur', '#7f8c8d', ['horreur', 'film d horreur', 'epouvante']),
      t('animation', 'Animation', '#16a085', ['animation', 'images de synthese', 'dessin anime']),
      t('famille', 'Jeunesse / Famille', '#e84393', ['familial', 'famille', 'enfance', 'jeunesse', 'film pour enfants']),
      t('documentaire', 'Documentaires', '#b7950b', ['documentaire', 'reportage']),
      t('series', 'Séries TV', '#27ae60', ['serie tv', 'serie televisee', 'serie']),
      t('musique', 'Musique / Concerts', '#d35400', ['musique', 'film musical', 'videomusique', 'concert', 'rock', 'musique classique']),
      t('divers', 'Divers', '#95a5a6', ['telefilm'], { special: 'divers' }),
    ],
  }
}

/**
 * Jeux vidéo (v2) : un thème par console, dans l'ordre où tu les as citées (modifiable dans Thèmes),
 * puis « Autres consoles ». Dans chaque console, les jeux sont rangés par titre.
 * Aucun regroupement automatique : même une poignée de jeux Super Nintendo garde sa place.
 */
export function defaultGameRules(platforms: Platform[] = MY_PLATFORMS): ClassificationRules {
  return withPlatforms(
    {
      version: RULES_VERSION,
      maxThemes: 40,
      minCdsPerTheme: 0,
      frenchTheme: false,
      artistOverrides: {},
      cdOverrides: {},
      themes: [],
    },
    platforms,
  )
}

/**
 * Règles des jeux avec TES consoles (écran « Mes consoles ») : un thème par console, dans l'ordre choisi,
 * puis « Autres consoles » (toutes les autres) et les thèmes que tu as créés toi-même.
 * Un thème de console déjà existant garde son nom et sa couleur ; une console retirée rejoint « Autres consoles ».
 */
export function withPlatforms(rules: ClassificationRules, platforms: Platform[]): ClassificationRules {
  const isPlatform = (id: string) => PLATFORMS.some((p) => p.id === id)
  const used = new Set(rules.themes.map((t) => t.color))
  const freeColor = (i: number) => THEME_COLORS.find((c) => !used.has(c)) ?? THEME_COLORS[i % THEME_COLORS.length]
  const mine = platforms.map((id, i): ThemeDef => {
    const existing = rules.themes.find((t) => t.id === id)
    if (existing) return existing
    const p = PLATFORMS.find((x) => x.id === id)!
    const color = freeColor(i)
    used.add(color)
    return { id, name: p.label, color, keywords: [p.label], sortBy: 'titre' }
  })
  const otherLabels = PLATFORMS.filter((p) => !platforms.includes(p.id)).map((p) => p.label)
  const allLabels = new Set(PLATFORMS.map((p) => normalizeKeyword(p.label)))
  const oldOthers = rules.themes.find((t) => t.id === 'autres')
  const others: ThemeDef = {
    ...(oldOthers ?? { id: 'autres', name: 'Autres consoles', color: '#95a5a6', sortBy: 'titre', special: 'divers' }),
    // Les consoles qui ne sont pas « à toi », plus les mots-clés ajoutés à la main.
    keywords: [...otherLabels, ...(oldOthers?.keywords ?? []).filter((k) => !allLabels.has(normalizeKeyword(k)))],
  }
  const custom = rules.themes.filter((t) => !isPlatform(t.id) && t.id !== 'autres')
  return { ...rules, themes: [...mine, others, ...custom] }
}

/**
 * Consoles ajoutées à l'appli après la création de tes thèmes : chacune rejoint « Autres consoles »
 * si aucun thème ne cite déjà son nom. Rien d'autre ne change (ordre, noms, couleurs).
 */
export function withNewPlatforms(rules: ClassificationRules): ClassificationRules {
  const autres = rules.themes.find((t) => t.id === 'autres')
  if (!autres) return rules
  const known = new Set(rules.themes.flatMap((t) => t.keywords.map(normalizeKeyword)))
  const missing = PLATFORMS.map((p) => p.label).filter((l) => !known.has(normalizeKeyword(l)))
  if (!missing.length) return rules
  return { ...rules, themes: rules.themes.map((t) => (t.id === 'autres' ? { ...t, keywords: [...t.keywords, ...missing] } : t)) }
}

const normalizeKeyword = (k: string) => k.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

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
 * v3 = Folk / Country fusionné dans Musiques du monde.
 * Renvoie null si rien n'a changé.
 */
/**
 * Fusionne un thème dans un autre : il disparaît, ses mots-clés et ses artistes forcés passent dans la cible.
 * Modifie `rules` ; renvoie false si l'un des deux thèmes n'existe pas.
 */
export function mergeThemeInto(rules: ClassificationRules, sourceId: string, targetId: string): boolean {
  const source = rules.themes.find((t) => t.id === sourceId)
  const target = rules.themes.find((t) => t.id === targetId)
  if (!source || !target || source === target) return false
  target.keywords = [...new Set([...target.keywords, ...source.keywords])]
  for (const map of [rules.artistOverrides, rules.cdOverrides]) {
    for (const k of Object.keys(map)) if (map[k] === source.id) map[k] = target.id
  }
  for (const t of rules.themes) if (t.mergeInto === source.id) t.mergeInto = target.id === t.id ? undefined : target.id
  rules.themes = rules.themes.filter((t) => t.id !== source.id)
  return true
}

export function migrateRules(rules: ClassificationRules): ClassificationRules | null {
  const version = rules.version ?? 1
  if (version >= RULES_VERSION) return null
  const r: ClassificationRules = JSON.parse(JSON.stringify(rules))
  if (version < 2) migrateToV2(r)
  // v3 : Folk / Country rangé avec les Musiques du monde (ton choix du 14/11/2026).
  if (version < 3) mergeThemeInto(r, 'folk', 'monde')
  r.version = RULES_VERSION
  return r
}

function migrateToV2(r: ClassificationRules): void {
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
}
