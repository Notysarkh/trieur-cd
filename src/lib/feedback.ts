import { settings } from '../services/settings'

// Bip + vibration à chaque scan, pour pouvoir enchaîner sans regarder l'écran.
// Aigu = ajouté ; moyen = déjà scanné / doublon ; grave = code illisible.

let audio: AudioContext | null = null

/**
 * À appeler lors d'un appui sur un bouton : sur iPhone, le son ne peut être activé
 * qu'à la suite d'un geste de l'utilisateur.
 */
export function unlockAudio(): void {
  try {
    audio ??= new AudioContext()
    void audio.resume()
  } catch {
    // pas de son disponible
  }
}

export function signal(kind: 'ok' | 'warn' | 'error'): void {
  if (!settings.feedback) return
  navigator.vibrate?.(kind === 'ok' ? 60 : [60, 60, 60])
  try {
    audio ??= new AudioContext()
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.frequency.value = kind === 'ok' ? 1046 : kind === 'warn' ? 523 : 220
    gain.gain.setValueAtTime(0.15, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.15)
    osc.connect(gain).connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + 0.15)
  } catch {
    // Pas de son disponible : tant pis, la vibration et l'écran suffisent.
  }
}
