import { reactive } from 'vue'

// Mesures de performance, affichées dans Réglages → Diagnostic.
// Elles servent à comprendre une lenteur sur un téléphone qu'on ne peut pas tester soi-même.

export interface SlowInteraction {
  what: string
  ms: number
  at: string
}

export const perf = reactive({
  scanner: { engine: '' as '' | 'natif' | 'ZXing', frames: 0, avgMs: 0, maxMs: 0, lastIntervalMs: 0 },
  /** Moments où l'appli a été bloquée plus de 50 ms d'affilée. */
  longTasks: { count: 0, totalMs: 0, maxMs: 0 },
  /** Touches / clics dont l'affichage a mis plus de 200 ms à réagir. */
  slowInteractions: [] as SlowInteraction[],
  startedAt: Date.now(),
})

/** Enregistre le temps d'analyse d'une image par le lecteur de codes-barres. */
export function recordScanFrame(ms: number, intervalMs: number): void {
  const s = perf.scanner
  s.frames++
  s.avgMs = s.avgMs + (ms - s.avgMs) / Math.min(s.frames, 50)
  s.maxMs = Math.max(s.maxMs, ms)
  s.lastIntervalMs = intervalMs
}

/** Décrit un élément cliqué en quelques mots (pour le diagnostic). */
function describe(el: unknown): string {
  if (!(el instanceof Element)) return '?'
  const text = (el.closest('button, a, label, input, select') ?? el).textContent?.trim().replace(/\s+/g, ' ') ?? ''
  return `${el.tagName.toLowerCase()}${text ? ` « ${text.slice(0, 40)} »` : ''}`
}

/** Démarre la surveillance (si le navigateur le permet). */
export function startPerfMonitoring(): void {
  if (typeof PerformanceObserver === 'undefined') return
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        perf.longTasks.count++
        perf.longTasks.totalMs += e.duration
        perf.longTasks.maxMs = Math.max(perf.longTasks.maxMs, e.duration)
      }
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    // non disponible sur ce navigateur
  }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceEventTiming[]) {
        if (e.duration < 200 || !['click', 'pointerup', 'keydown', 'input', 'change'].includes(e.name)) continue
        perf.slowInteractions.unshift({
          what: `${e.name} sur ${describe(e.target)}`,
          ms: Math.round(e.duration),
          at: new Date().toLocaleTimeString('fr-FR'),
        })
        if (perf.slowInteractions.length > 15) perf.slowInteractions.pop()
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 200 } as PerformanceObserverInit)
  } catch {
    // non disponible sur ce navigateur
  }
}
