import Dexie, { type EntityTable } from 'dexie'
import { cleanTags, latinArtistName } from '../lib/cleanup'
import type { ArtistInfo, Cd, ScanItem, SettingRow } from './types'

// La base de données locale (IndexedDB, via la bibliothèque Dexie).
// Quatre « tables » : la collection, la file de scan, les réglages,
// et les informations d'artistes récupérées sur MusicBrainz (pour le classement).
export const db = new Dexie('trieur-cd') as Dexie & {
  cds: EntityTable<Cd, 'id'>
  scans: EntityTable<ScanItem, 'id'>
  settings: EntityTable<SettingRow, 'key'>
  artists: EntityTable<ArtistInfo, 'mbArtistId'>
}

// Les champs listés ici sont « indexés » : on peut chercher rapidement dessus.
// Les autres champs sont stockés quand même, simplement sans index.
db.version(1).stores({
  cds: 'id, barcode, status, artistSort, mbReleaseGroupId, updatedAt',
  scans: 'id, barcode, state, scannedAt',
  settings: 'key',
})
// Version 2 (étape 2) : ajout de la table des artistes et de l'index des thèmes.
db.version(2).stores({
  cds: 'id, barcode, status, artistSort, mbReleaseGroupId, updatedAt, themeId',
  artists: 'mbArtistId',
})

// Version 3 (v1.2) : nettoyage automatique de la collection existante, une seule fois :
// - étiquettes MusicBrainz parasites retirées des genres/styles ;
// - noms d'artistes en japonais (ou autre alphabet) affichés en lettres latines quand le nom de tri le permet ;
// - boîtiers « double épais » à 22 mm (mesurés) au lieu de 24.
db.version(3)
  .stores({})
  .upgrade((tx) =>
    tx
      .table('cds')
      .toCollection()
      .modify((cd: Cd) => {
        cd.genres = cleanTags(cd.genres ?? [])
        cd.styles = cleanTags(cd.styles ?? [])
        const latin = latinArtistName(cd.artist, cd.artistSort)
        if (latin) {
          cd.artistOriginal = cd.artist
          cd.artist = latin
        }
        if (cd.format === 'double' && cd.thicknessMm === 24) cd.thicknessMm = 22
      }),
  )

/** Crée un identifiant unique. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Demande au navigateur de ne jamais effacer nos données pour faire de la place.
 * Sans cela, un téléphone presque plein pourrait vider la collection.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
