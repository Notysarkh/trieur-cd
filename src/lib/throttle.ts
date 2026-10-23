// File d'attente qui espace les appels à un service en ligne.
// MusicBrainz exige au maximum 1 requête par seconde : tous les appels passent par ici,
// les uns après les autres, avec un délai minimum entre deux appels.
//
// Priorités : une action que tu fais toi-même (recherche par titre, choix d'un album) passe
// AVANT le travail de fond (identification de la file de scan, « Compléter ma collection »),
// sinon elle attendrait derrière des dizaines de requêtes.

export type Priority = 'normal' | 'high'

interface Job {
  task: () => Promise<unknown>
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
  high: boolean
}

export class Throttle {
  private last = 0
  private queue: Job[] = []
  private running = false
  private readonly minIntervalMs: number
  /** Durées des derniers appels (pour le diagnostic). */
  readonly durations: number[] = []

  constructor(minIntervalMs: number) {
    this.minIntervalMs = minIntervalMs
  }

  /** Nombre d'appels en attente (y compris celui en cours). */
  get pending(): number {
    return this.queue.length + (this.running ? 1 : 0)
  }

  /** Exécute `task` dès que le délai minimum depuis l'appel précédent est écoulé. */
  run<T>(task: () => Promise<T>, priority: Priority = 'normal'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: Job = { task, resolve: resolve as (v: unknown) => void, reject, high: priority === 'high' }
      if (job.high) {
        // Après les autres demandes prioritaires, mais avant tout le travail de fond.
        const firstNormal = this.queue.findIndex((j) => !j.high)
        this.queue.splice(firstNormal < 0 ? this.queue.length : firstNormal, 0, job)
      } else {
        this.queue.push(job)
      }
      void this.pump()
    })
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length) {
        const job = this.queue.shift()!
        const wait = this.last + this.minIntervalMs - Date.now()
        if (wait > 0) await sleep(wait)
        this.last = Date.now()
        try {
          job.resolve(await job.task())
        } catch (e) {
          job.reject(e)
        }
        this.durations.push(Date.now() - this.last)
        if (this.durations.length > 30) this.durations.shift()
      }
    } finally {
      this.running = false
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Erreur réseau avec le code HTTP, pour savoir s'il faut réessayer. */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Appelle une adresse en passant par la file `throttle`.
 * Si le service répond « trop de requêtes » (503 ou 429), on patiente puis on réessaie (3 fois max).
 */
export async function throttledJson<T>(
  throttle: Throttle,
  url: string,
  init: RequestInit = {},
  priority: Priority = 'normal',
  retries = 3,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await throttle.run(
      () =>
        fetch(url, init).catch(() => {
          throw new Error('Pas de réponse du service (connexion internet ?)')
        }),
      priority,
    )
    if (res.ok) return (await res.json()) as T
    if ((res.status === 503 || res.status === 429) && attempt < retries) {
      await sleep(2000 * (attempt + 1))
      continue
    }
    throw new HttpError(res.status, `Le service a répondu ${res.status} (${res.statusText || 'erreur'})`)
  }
}
