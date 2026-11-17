// Accès à la caméra, partagé par le scanner de codes-barres et les photos (jaquette, rangée de jeux).
//
// 1. Toujours la caméra ARRIÈRE PRINCIPALE : les téléphones récents ont plusieurs caméras arrière (grand-angle,
//    ultra grand-angle, téléobjectif, macro) ; le navigateur ne choisit pas toujours la principale. Au premier usage,
//    l'appli la repère d'après le nom des caméras (« camera2 0, facing back » sur Android, « Caméra arrière » /
//    « Back Camera » sur iPhone), puis la retient sur cet appareil.
// 2. Une caméra ne peut servir qu'à une chose à la fois : si une ouverture précédente n'a pas été refermée
//    (écran quitté pendant l'ouverture, appareil photo du téléphone pas encore relâché…), le navigateur répond
//    « Could not start video source » (NotReadableError). Avant d'ouvrir la caméra, on referme TOUT ce que
//    l'appli a encore ouvert ; si elle est occupée, on réessaie après une courte pause.

const open = new Set<MediaStream>()
const SAVED_KEY = 'mediamwa-camera-principale'

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
const errName = (e: unknown) => (e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '')

/** Caméra occupée (ou qui n'a pas démarré) : on peut réessayer. */
export function isBusyError(e: unknown): boolean {
  const name = errName(e)
  return name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError' || /could not start video source/i.test(String(e))
}

/** Réglage impossible sur cet appareil (caméra retenue disparue, pas de caméra arrière…) : on passe au suivant. */
function isUnavailable(e: unknown): boolean {
  const name = errName(e)
  return name === 'OverconstrainedError' || name === 'NotFoundError' || name === 'ConstraintNotSatisfiedError'
}

// --- Caméra arrière principale ---

const BACK = /back|rear|arri[eè]re|environment/i
/** Caméras arrière secondaires (ou virtuelles qui en combinent plusieurs). */
const SECONDARY = /ultra|wide|grand[\s-]?angle|tele|t[ée]l[ée]objectif|macro|depth|profondeur|dual|double|triple|infra|\bir\b|monochrome/i

/** La caméra arrière principale parmi celles de l'appareil (d'après leur nom), ou undefined. */
export function pickMainBack(devices: { deviceId: string; label: string; kind?: string }[]): string | undefined {
  const back = devices.filter((d) => (d.kind ?? 'videoinput') === 'videoinput' && d.deviceId && BACK.test(d.label))
  if (!back.length) return undefined
  const main = back.filter((d) => !SECONDARY.test(d.label))
  const pool = main.length ? main : back
  // Android : « camera2 0, facing back » est la principale (le plus petit numéro).
  const num = (label: string) => Number(label.match(/camera2?\s*(\d+)/i)?.[1] ?? 99)
  return [...pool].sort((a, b) => num(a.label) - num(b.label))[0].deviceId
}

function readSaved(): string | undefined {
  try {
    return localStorage.getItem(SAVED_KEY) ?? undefined
  } catch {
    return undefined
  }
}
function save(id: string | undefined) {
  try {
    if (id) localStorage.setItem(SAVED_KEY, id)
    else localStorage.removeItem(SAVED_KEY)
  } catch {
    // stockage indisponible (navigation privée) : on la recherchera la prochaine fois
  }
}

/** Oublie la caméra retenue (elle sera recherchée à la prochaine ouverture). */
export function forgetMainCamera(): void {
  save(undefined)
}

function track(stream: MediaStream): MediaStream {
  open.add(stream)
  // La caméra s'arrête (reprise par une autre appli…) : on l'oublie.
  stream.getVideoTracks()[0]?.addEventListener('ended', () => open.delete(stream))
  return stream
}

/** Essaie chaque réglage dans l'ordre : caméra occupée → pause et suivant ; réglage impossible → suivant. */
async function tryAll(attempts: MediaStreamConstraints[]): Promise<MediaStream> {
  let last: unknown
  for (let i = 0; i < attempts.length; i++) {
    try {
      return await navigator.mediaDevices.getUserMedia(attempts[i])
    } catch (e) {
      last = e
      if (isBusyError(e)) await wait(i === 0 ? 700 : 300)
      else if (!isUnavailable(e)) throw e
    }
  }
  throw last
}

/**
 * Ouvre la caméra arrière principale. `width`/`height` : résolution souhaitée (pas obligatoire).
 * Essais : caméra principale retenue → caméra arrière (exigée) → caméra arrière (souhaitée, deux fois)
 * → caméra arrière sans résolution → n'importe quelle caméra.
 */
export async function openCamera(size: { width: number; height: number }): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Ce navigateur ne donne pas accès à la caméra. L'appli doit être ouverte via une adresse sécurisée (https).")
  }
  closeAllCameras()
  const res = { width: { ideal: size.width }, height: { ideal: size.height } }
  const saved = readSaved()
  const attempts: MediaStreamConstraints[] = [
    ...(saved ? [{ video: { deviceId: { exact: saved }, ...res }, audio: false }] : []),
    { video: { facingMode: { exact: 'environment' }, ...res }, audio: false },
    { video: { facingMode: { ideal: 'environment' }, ...res }, audio: false },
    { video: { facingMode: { ideal: 'environment' }, ...res }, audio: false },
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    { video: true, audio: false },
  ]
  let stream = await tryAll(attempts)
  const current = stream.getVideoTracks()[0]?.getSettings?.().deviceId
  if (saved && current === saved) return track(stream)

  // Première fois (ou caméra retenue disparue) : on repère la principale et on bascule dessus si besoin.
  try {
    const main = pickMainBack(await navigator.mediaDevices.enumerateDevices())
    if (main && main !== current) {
      stream.getTracks().forEach((t) => t.stop())
      try {
        stream = await tryAll([{ video: { deviceId: { exact: main }, ...res }, audio: false }])
      } catch {
        // La principale refuse de s'ouvrir : on reprend celle du navigateur.
        stream = await tryAll(attempts.slice(saved ? 1 : 0))
        save(undefined)
        return track(stream)
      }
    }
    save(main)
  } catch {
    // Liste des caméras indisponible : on garde celle choisie par le navigateur.
  }
  return track(stream)
}

/** Message clair pour une erreur de caméra. */
export function cameraErrorMessage(e: unknown): string {
  const name = errName(e)
  if (name === 'NotAllowedError') return "L'accès à la caméra a été refusé. Autorise-le dans les réglages du navigateur, puis réessaie."
  if (name === 'NotFoundError') return 'Aucune caméra trouvée sur cet appareil.'
  if (isBusyError(e)) {
    return "La caméra est occupée (appareil photo du téléphone ou autre appli encore ouverts). Ferme-les, puis touche « Réessayer ». Si ça continue, ferme complètement Mediamwa (glisse-la hors des applis récentes) et rouvre-la."
  }
  return e instanceof Error ? e.message : 'Impossible de démarrer la caméra.'
}
