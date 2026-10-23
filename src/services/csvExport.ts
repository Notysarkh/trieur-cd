import { UNCLASSIFIED_THEME } from '../classification/engine'
import { db } from '../db/database'
import type { Cd, CdDraft, CdFormat, CdStatus } from '../db/types'
import { digitsOnly } from '../lib/barcode'
import { parseCsv, toCsv } from '../lib/csv'
import { FORMAT_LABELS } from '../lib/formats'
import { guessSortName } from '../lib/sortName'
import { normalizeText } from '../lib/text'
import { addCd, updateCd } from './collection'
import { locationLabel } from './layout'
import { settings } from './settings'

// Export de la collection en CSV (à ouvrir dans Excel / LibreOffice) et import d'un CSV.
//
// À l'import :
// - une ligne dont l'« id » existe déjà met à jour ce CD (les cellules vides ne changent rien) ;
// - une ligne sans id connu crée un nouveau CD ;
// - les colonnes Thème, Emplacement et Confiance sont ignorées (elles sont recalculées par l'appli).

const STATUS_LABELS: Record<CdStatus, string> = { identifie: 'Identifié', a_verifier: 'À vérifier', manuel: 'Manuel' }

const num = (v: string): number | undefined => {
  const n = Number(v.replace(',', '.').trim())
  return v.trim() && Number.isFinite(n) ? n : undefined
}
const list = (v: string) =>
  v
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean)
const findKey = <K extends string>(labels: Record<K, string>, v: string): K | undefined =>
  (Object.keys(labels) as K[]).find(
    (k) => normalizeText(k) === normalizeText(v) || normalizeText(labels[k]) === normalizeText(v),
  )

interface Column {
  header: string
  get: (cd: Cd) => string | number | undefined
  /** Absent : colonne exportée seulement (pas relue à l'import). */
  set?: (d: Partial<CdDraft>, value: string) => void
}

const themeName = (cd: Cd) =>
  cd.themeId
    ? (settings.classification.themes.find((t) => t.id === cd.themeId)?.name ?? UNCLASSIFIED_THEME.name)
    : ''

const COLUMNS: Column[] = [
  { header: 'id', get: (c) => c.id },
  { header: 'Artiste', get: (c) => c.artist, set: (d, v) => (d.artist = v) },
  { header: 'Nom de tri', get: (c) => c.artistSort, set: (d, v) => (d.artistSort = v) },
  { header: 'Titre', get: (c) => c.title, set: (d, v) => (d.title = v) },
  { header: 'Année', get: (c) => c.year, set: (d, v) => (d.year = num(v)) },
  { header: 'Année édition', get: (c) => c.releaseYear, set: (d, v) => (d.releaseYear = num(v)) },
  { header: 'Label', get: (c) => c.label, set: (d, v) => (d.label = v) },
  { header: 'Référence', get: (c) => c.catalogNumber, set: (d, v) => (d.catalogNumber = v) },
  { header: 'Pays', get: (c) => c.country, set: (d, v) => (d.country = v) },
  { header: 'Genres', get: (c) => c.genres.join(' | '), set: (d, v) => (d.genres = list(v)) },
  { header: 'Styles', get: (c) => c.styles.join(' | '), set: (d, v) => (d.styles = list(v)) },
  { header: 'Compositeur', get: (c) => c.composer, set: (d, v) => (d.composer = v) },
  {
    header: 'Compilation',
    get: (c) => (c.isCompilation ? 'oui' : 'non'),
    set: (d, v) => (d.isCompilation = /^(oui|yes|1|vrai|true)$/i.test(v.trim())),
  },
  {
    header: 'Format',
    get: (c) => FORMAT_LABELS[c.format],
    set: (d, v) => {
      const f = findKey<CdFormat>(FORMAT_LABELS, v)
      if (f) d.format = f
    },
  },
  {
    header: 'Disques',
    get: (c) => c.discCount,
    set: (d, v) => {
      const n = num(v)
      if (n && n > 0) d.discCount = Math.round(n)
    },
  },
  {
    header: 'Épaisseur (mm)',
    get: (c) => String(c.thicknessMm).replace('.', ','),
    set: (d, v) => {
      const n = num(v)
      if (n && n > 0) d.thicknessMm = n
    },
  },
  {
    // Écrit sous la forme ="0077774644020" pour qu'Excel garde les zéros du début.
    header: 'Code-barres',
    get: (c) => (c.barcode ? `="${c.barcode}"` : ''),
    set: (d, v) => (d.barcode = digitsOnly(v) || undefined),
  },
  {
    header: 'Statut',
    get: (c) => STATUS_LABELS[c.status],
    set: (d, v) => {
      const s = findKey<CdStatus>(STATUS_LABELS, v)
      if (s) d.status = s
    },
  },
  { header: 'Confiance', get: (c) => c.confidence },
  { header: 'Thème', get: themeName },
  { header: 'Emplacement', get: (c) => locationLabel(c) ?? '' },
  { header: 'Notes', get: (c) => c.notes, set: (d, v) => (d.notes = v) },
]

/** Fichier CSV de toute la collection, dans l'ordre de rangement. */
export async function buildCsv(): Promise<File> {
  const cds = (await db.cds.toArray()).sort(
    (a, b) =>
      (a.shelfOrder ?? Infinity) - (b.shelfOrder ?? Infinity) ||
      a.artistSort.localeCompare(b.artistSort, 'fr', { sensitivity: 'base' }),
  )
  const rows = [COLUMNS.map((c) => c.header), ...cds.map((cd) => COLUMNS.map((c) => c.get(cd)))]
  const date = new Date().toISOString().slice(0, 10)
  // Le caractère invisible ﻿ au début indique à Excel que le fichier est en UTF-8 (accents).
  return new File(['﻿' + toCsv(rows)], `trieur-cd-${date}.csv`, { type: 'text/csv' })
}

export interface CsvReport {
  added: number
  updated: number
  unchanged: number
  skipped: number
}

export async function importCsv(file: File): Promise<CsvReport> {
  const rows = parseCsv(await file.text())
  if (rows.length < 2) throw new Error('Le fichier ne contient pas de lignes de CD.')
  const header = rows[0].map((h) => normalizeText(h))
  const columns = header.map((h) => COLUMNS.find((c) => normalizeText(c.header) === h))
  const idIndex = header.indexOf('id')
  if (!columns.some((c) => c?.header === 'Titre') && !columns.some((c) => c?.header === 'Artiste')) {
    throw new Error('Colonnes « Artiste » et « Titre » introuvables : vérifie la première ligne du fichier.')
  }

  const report: CsvReport = { added: 0, updated: 0, unchanged: 0, skipped: 0 }
  for (const row of rows.slice(1)) {
    const changes: Partial<CdDraft> = {}
    row.forEach((raw, i) => {
      const value = raw.replace(/^="(.*)"$/, '$1')
      if (value.trim() !== '') columns[i]?.set?.(changes, value.trim())
    })
    const id = idIndex >= 0 ? row[idIndex]?.trim() : ''
    const existing = id ? await db.cds.get(id) : undefined
    if (existing) {
      // On ne garde que ce qui change vraiment : un CD identique n'est pas touché
      // (sa date de modification reste la même, ce qui compte pour la synchro téléphone ↔ PC).
      const diff = Object.fromEntries(
        Object.entries(changes).filter(
          ([k, v]) => JSON.stringify(v) !== JSON.stringify(existing[k as keyof Cd]),
        ),
      ) as Partial<CdDraft>
      if (Object.keys(diff).length) {
        await updateCd(existing.id, diff)
        report.updated++
      } else {
        report.unchanged++
      }
    } else if (changes.title || changes.artist) {
      const artist = changes.artist ?? 'Inconnu'
      const format = changes.format ?? 'standard'
      const draft = {
        artist,
        artistSort: changes.artistSort ?? guessSortName(artist),
        title: changes.title ?? 'Sans titre',
        genres: [],
        styles: [],
        format,
        discCount: 1,
        thicknessMm: settings.thickness[format],
        coverUrls: [],
        isCompilation: false,
        status: 'manuel',
        confidence: 100,
        confidenceReasons: ['Importé depuis un fichier CSV'],
        source: 'manuel',
        ...changes,
      } as CdDraft
      // On garde l'id du fichier : réimporter le même CSV ne créera pas de doublons.
      await addCd(draft, id || undefined)
      report.added++
    } else {
      report.skipped++
    }
  }
  return report
}
