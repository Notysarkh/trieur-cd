// File d'attente qui espace les appels à un service en ligne.
// MusicBrainz exige au maximum 1 requête par seconde : tous les appels passent par ici,
// les uns après les autres, avec un délai minimum entre deux appels.

export class Throttle {
  private last = 0
  private chain: Promise<unknown> = Promise.resolve()
  private readonly minIntervalMs: number

  constructor(minIntervalMs: number) {
    this.minIntervalMs = minIntervalMs
  }

  /** Exécute `task` dès que le délai minimum depuis l'appel précédent est écoulé. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(async () => {
      const wait = this.last + this.minIntervalMs - Date.now()
      if (wait > 0) await sleep(wait)
      this.last = Date.now()
      return task()
    })
    // Une erreur sur un appel ne doit pas bloquer les suivants.
    this.chain = next.catch(() => undefined)
    return next
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
  retries = 3,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await throttle.run(() =>
      fetch(url, init).catch(() => {
        throw new Error('Pas de réponse du service (connexion internet ?)')
      }),
    )
    if (res.ok) return (await res.json()) as T
    if ((res.status === 503 || res.status === 429) && attempt < retries) {
      await sleep(2000 * (attempt + 1))
      continue
    }
    throw new HttpError(res.status, `Le service a répondu ${res.status} (${res.statusText || 'erreur'})`)
  }
}
