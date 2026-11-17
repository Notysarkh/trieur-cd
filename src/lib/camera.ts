// Accès à la caméra, partagé par le scanner de codes-barres et les photos (jaquette, rangée de jeux).
//
// Une caméra ne peut servir qu'à une chose à la fois : si une ouverture précédente n'a pas été refermée
// (écran quitté pendant l'ouverture, appareil photo du téléphone pas encore relâché…), le navigateur répond
// « Could not start video source » (NotReadableError). Pour l'éviter :
// - avant d'ouvrir la caméra, on referme TOUT ce que l'appli a encore ouvert ;
// - si elle est occupée, on réessaie après une courte pause, puis avec des réglages plus simples
//   (certains téléphones refusent une grande résolution).

const open = new Set<MediaStream>()

/** Referme une ouverture de la caméra (sans erreur si elle l'est déjà). */
export function closeCamera(stream: MediaStream | null | undefined): void {
  if (!stream) return
  stream.getTracks().forEach((t) => t.stop())
  open.delete(stream)
}

/** Referme toutes les ouvertures de la caméra faites par l'appli. */
export function closeAllCameras(): void {
  for (const s of [...open]) closeCamera(s)
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Caméra occupée (ou qui n'a pas démarré) : on peut réessayer. */
export function isBusyError(e: unknown): boolean {
  const name = e instanceof DOMException ? e.name : ''
  return name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError' || /could not start video source/i.test(String(e))
}

/**
 * Ouvre la caméra arrière. `width`/`height` : résolution souhaitée (pas obligatoire).
 * Essais : réglages demandés → (pause) mêmes réglages → caméra arrière sans résolution → n'importe quelle caméra.
 */
export async function openCamera(size: { width: number; height: number }): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Ce navigateur ne donne pas accès à la caméra. L'appli doit être ouverte via une adresse sécurisée (https).")
  }
  closeAllCameras()
  const attempts: MediaStreamConstraints[] = [
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: size.width }, height: { ideal: size.height } }, audio: false },
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: size.width }, height: { ideal: size.height } }, audio: false },
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    { video: true, audio: false },
  ]
  let last: unknown
  for (let i = 0; i < attempts.length; i++) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(attempts[i])
      open.add(stream)
      // La caméra s'arrête (reprise par une autre appli…) : on l'oublie.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => open.delete(stream))
      return stream
    } catch (e) {
      last = e
      if (!isBusyError(e)) throw e
      await wait(i === 0 ? 700 : 300)
    }
  }
  throw last
}

/** Message clair pour une erreur de caméra. */
export function cameraErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError') return "L'accès à la caméra a été refusé. Autorise-le dans les réglages du navigateur, puis réessaie."
  if (name === 'NotFoundError') return 'Aucune caméra trouvée sur cet appareil.'
  if (isBusyError(e)) {
    return "La caméra est occupée (appareil photo du téléphone ou autre appli encore ouverts). Ferme-les, puis touche « Réessayer ». Si ça continue, ferme complètement Mediamwa (glisse-la hors des applis récentes) et rouvre-la."
  }
  return e instanceof Error ? e.message : 'Impossible de démarrer la caméra.'
}
