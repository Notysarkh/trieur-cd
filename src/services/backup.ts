import { db } from '../db/database'
import type { ClassificationRules } from '../classification/themes'
import type { Furniture, LayoutOptions } from '../layout/furniture'
import type { Platform } from '../db/types'
import type { Cd } from '../db/types'
import { saveSetting, settings } from './settings'
import { addV2Furniture } from '../layout/furniture'

const OTHER_LAYOUTS = ['bookLayoutAppliedAt', 'videoLayoutAppliedAt', 'gameLayoutAppliedAt'] as const
const OPTIONS_OF = { bookLayoutAppliedAt: 'bookLayout', videoLayoutAppliedAt: 'videoLayout', gameLayoutAppliedAt: 'gameLayout' } as const

// Sauvegarde et transfert de la collection (téléphone → PC) via un fichier JSON.
// Le jeton Discogs n'est volontairement PAS inclus dans le fichier.

const FORMAT = 'trieur-cd'
const VERSION = 1

interface BackupFile {
  format: typeof FORMAT
  version: number
  exportedAt: string
  cds: Cd[]
  /** Thèmes et règles de classement (depuis l'étape 2). */
  classification?: ClassificationRules
  /** Meubles et options de répartition (depuis l'étape 3). */
  furniture?: Furniture[]
  layout?: LayoutOptions
  /** Date du rangement appliqué (v1.1) : les emplacements des CD en dépendent. */
  layoutAppliedAt?: number
  bookLayoutAppliedAt?: number
  videoLayoutAppliedAt?: number
  gameLayoutAppliedAt?: number
  bookLayout?: LayoutOptions
  videoLayout?: LayoutOptions
  gameLayout?: LayoutOptions
  classificationAppliedAt?: number
  /** Thèmes et règles des livres / BD (v2). */
  bookClassification?: ClassificationRules
  bookClassificationAppliedAt?: number
  videoClassification?: ClassificationRules
  videoClassificationAppliedAt?: number
  gameClassification?: ClassificationRules
  gameClassificationAppliedAt?: number
  myPlatforms?: Platform[]
}

/** Prépare le fichier de sauvegarde. */
export async function buildBackup(): Promise<File> {
  const data: BackupFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    cds: await db.cds.toArray(),
    classification: JSON.parse(JSON.stringify(settings.classification)),
    furniture: JSON.parse(JSON.stringify(settings.furniture)),
    layout: { ...settings.layout },
    layoutAppliedAt: settings.layoutAppliedAt,
    bookLayoutAppliedAt: settings.bookLayoutAppliedAt,
    videoLayoutAppliedAt: settings.videoLayoutAppliedAt,
    gameLayoutAppliedAt: settings.gameLayoutAppliedAt,
    bookLayout: { ...settings.bookLayout },
    videoLayout: { ...settings.videoLayout },
    gameLayout: { ...settings.gameLayout },
    classificationAppliedAt: settings.classificationAppliedAt,
    bookClassification: JSON.parse(JSON.stringify(settings.bookClassification)),
    bookClassificationAppliedAt: settings.bookClassificationAppliedAt,
    videoClassification: JSON.parse(JSON.stringify(settings.videoClassification)),
    videoClassificationAppliedAt: settings.videoClassificationAppliedAt,
    gameClassification: JSON.parse(JSON.stringify(settings.gameClassification)),
    gameClassificationAppliedAt: settings.gameClassificationAppliedAt,
    myPlatforms: [...settings.myPlatforms],
  }
  const date = new Date().toISOString().slice(0, 10)
  return new File([JSON.stringify(data, null, 1)], `mediamwa-${date}.json`, { type: 'application/json' })
}

/**
 * Envoie le fichier : sur téléphone, ouvre le menu « Partager » (mail, OneDrive…) ;
 * sinon, le télécharge.
 */
export async function shareOrDownload(file: File): Promise<'partage' | 'telecharge'> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Sauvegarde Mediamwa' })
      return 'partage'
    } catch (e) {
      // Partage annulé par l'utilisateur : on ne fait rien de plus.
      if (e instanceof DOMException && e.name === 'AbortError') return 'partage'
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'telecharge'
}

export interface ImportReport {
  added: number
  updated: number
  unchanged: number
  rulesReplaced: boolean
  /** Le rangement appliqué sur l'autre appareil (meubles + emplacements) a été repris ici. */
  layoutAdopted: boolean
}

/**
 * Importe une sauvegarde en la FUSIONNANT avec la collection actuelle :
 * - un CD absent est ajouté ;
 * - un CD présent des deux côtés garde la version la plus récemment modifiée.
 * Rien n'est jamais supprimé par un import.
 * Les thèmes, règles de classement et meubles ne sont remplacés que si tu le demandes (case à cocher dans les Réglages).
 * Exception : si AUCUN rangement n'a encore été appliqué sur cet appareil et que le fichier en contient un
 * (cas typique : rangement préparé sur le PC, puis import sur le téléphone), on reprend automatiquement
 * les meubles, les thèmes et le rangement du fichier : sans eux, les emplacements des CD ne voudraient rien dire.
 */
export async function importBackup(file: File, replaceRules = false): Promise<ImportReport> {
  let data: BackupFile
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error("Ce fichier n'est pas un fichier JSON lisible.")
  }
  if (data?.format !== FORMAT || !Array.isArray(data.cds)) {
    throw new Error("Ce fichier n'est pas une sauvegarde de Mediamwa (ou du Trieur à CD).")
  }
  if (data.version > VERSION) {
    throw new Error("Cette sauvegarde vient d'une version plus récente de l'appli : mets l'appli à jour.")
  }
  const report: ImportReport = { added: 0, updated: 0, unchanged: 0, rulesReplaced: false, layoutAdopted: false }
  const adoptLayout = !!data.layoutAppliedAt && (replaceRules || !settings.layoutAppliedAt)
  // Rangements des livres, films et jeux : repris s'ils n'ont pas encore été faits sur cet appareil.
  const adoptOthers = OTHER_LAYOUTS.filter((k) => !!data[k] && (replaceRules || !settings[k]))
  await db.transaction('rw', db.cds, async () => {
    for (const cd of data.cds) {
      if (!cd?.id) continue
      const existing = await db.cds.get(cd.id)
      if (!existing) {
        await db.cds.add(cd)
        report.added++
      } else if ((cd.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
        await db.cds.put(cd)
        report.updated++
      } else {
        report.unchanged++
      }
    }
  })
  if ((replaceRules || adoptLayout) && data.classification?.themes?.length) {
    await saveSetting('classification', data.classification)
    report.rulesReplaced = true
  }
  if ((replaceRules || adoptLayout || adoptOthers.length) && data.furniture?.length) {
    // Sauvegarde d'avant l'étape E : on y ajoute les meubles des livres, films et jeux (sans rien changer d'autre).
    await saveSetting('furniture', addV2Furniture(data.furniture))
    // Options des CD : seulement si le rangement des CD est repris (sinon le plan des CD changerait).
    if (data.layout && (replaceRules || adoptLayout)) await saveSetting('layout', data.layout)
    report.rulesReplaced = true
  }
  // Livres : les règles du fichier sont reprises si tu le demandes, ou si aucun classement de livres
  // n'a encore été appliqué sur cet appareil (cas du transfert PC → téléphone).
  const adoptBooks = !!data.bookClassificationAppliedAt && !settings.bookClassificationAppliedAt
  if ((replaceRules || adoptBooks) && data.bookClassification?.themes?.length) {
    await saveSetting('bookClassification', data.bookClassification)
    if (data.bookClassificationAppliedAt) await saveSetting('bookClassificationAppliedAt', data.bookClassificationAppliedAt)
    report.rulesReplaced = true
  }
  const adoptVideos = !!data.videoClassificationAppliedAt && !settings.videoClassificationAppliedAt
  if ((replaceRules || adoptVideos) && data.videoClassification?.themes?.length) {
    await saveSetting('videoClassification', data.videoClassification)
    if (data.videoClassificationAppliedAt) await saveSetting('videoClassificationAppliedAt', data.videoClassificationAppliedAt)
    report.rulesReplaced = true
  }
  const adoptGames = !!data.gameClassificationAppliedAt && !settings.gameClassificationAppliedAt
  if ((replaceRules || adoptGames) && data.gameClassification?.themes?.length) {
    await saveSetting('gameClassification', data.gameClassification)
    // Les consoles vont avec les thèmes des jeux.
    if (data.myPlatforms?.length) {
      await saveSetting('myPlatforms', data.myPlatforms)
      await saveSetting('platformsSetupDone', 1)
    }
    if (data.gameClassificationAppliedAt) await saveSetting('gameClassificationAppliedAt', data.gameClassificationAppliedAt)
    report.rulesReplaced = true
  }
  if (adoptLayout) {
    await saveSetting('layoutAppliedAt', data.layoutAppliedAt!)
    if (data.classificationAppliedAt) await saveSetting('classificationAppliedAt', data.classificationAppliedAt)
    report.layoutAdopted = true
  }
  for (const k of adoptOthers) {
    await saveSetting(k, data[k]!)
    const opts = OPTIONS_OF[k]
    if (data[opts]) await saveSetting(opts, data[opts]!)
    report.layoutAdopted = true
  }
  return report
}
