<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { canonicalBarcode, isValidGtin } from '../lib/barcode'
import { unlockAudio } from '../lib/feedback'
import { perf, recordScanFrame } from '../services/perf'

// Lecteur de code-barres par la caméra.
//
// - Sur Android (Chrome), on utilise le lecteur intégré au navigateur (rapide).
// - Ailleurs (iPhone, Firefox…), on charge le moteur ZXing, embarqué dans l'appli (marche hors ligne).
// - Un code n'est accepté que s'il est lu 2 fois de suite et que sa clé de contrôle est bonne :
//   cela évite presque toutes les erreurs de lecture.

const props = defineProps<{ paused?: boolean; compact?: boolean }>()
const emit = defineEmits<{ detected: [code: string]; resume: [] }>()

type Detector = { detect(source: HTMLCanvasElement): Promise<{ rawValue: string }[]> }

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

let detectorPromise: Promise<Detector> | null = null

/** Prépare le lecteur (une seule fois). */
function getDetector(): Promise<Detector> {
  detectorPromise ??= (async () => {
    const Native = (globalThis as { BarcodeDetector?: any }).BarcodeDetector
    if (Native) {
      try {
        const supported: string[] = await Native.getSupportedFormats()
        if (supported.includes('ean_13')) {
          perf.scanner.engine = 'natif'
          return new Native({ formats: FORMATS }) as Detector
        }
      } catch {
        // on bascule sur ZXing
      }
    }
    const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill')
    const wasmUrl = (await import('zxing-wasm/reader/zxing_reader.wasm?url')).default
    prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
    })
    perf.scanner.engine = 'ZXing'
    return new BarcodeDetector({ formats: FORMATS as never }) as Detector
  })()
  return detectorPromise
}

const video = ref<HTMLVideoElement>()
const status = ref<'idle' | 'starting' | 'running' | 'error'>('idle')
const errorMessage = ref('')
const torchAvailable = ref(false)
const torchOn = ref(false)
const flash = ref('')

let stream: MediaStream | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let pending: { code: string; at: number } | null = null
const recentlySent = new Map<string, number>()

async function start() {
  if (status.value === 'starting' || status.value === 'running') return
  unlockAudio()
  status.value = 'starting'
  errorMessage.value = ''
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Ce navigateur ne donne pas accès à la caméra. L'appli doit être ouverte via une adresse sécurisée (https).",
      )
    }
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
    const v = video.value!
    v.srcObject = stream
    await v.play()
    const track = stream.getVideoTracks()[0]
    const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean }
    torchAvailable.value = !!caps.torch
    await getDetector()
    status.value = 'running'
    tick()
  } catch (e) {
    stop()
    status.value = 'error'
    const name = e instanceof DOMException ? e.name : ''
    errorMessage.value =
      name === 'NotAllowedError'
        ? "L'accès à la caméra a été refusé. Autorise-le dans les réglages du navigateur, puis réessaie."
        : name === 'NotFoundError'
          ? 'Aucune caméra trouvée sur cet appareil. Tu peux taper le code-barres à la main.'
          : e instanceof Error
            ? e.message
            : 'Impossible de démarrer la caméra.'
  }
}

function stop() {
  clearTimeout(timer)
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  torchOn.value = false
  if (status.value !== 'error') status.value = 'idle'
}

// Pour ménager le téléphone :
// - on n'analyse que la bande centrale de l'image (là où est le cadre), réduite à 960 pixels de large ;
// - on attend entre deux analyses au moins 2 fois le temps de la précédente (minimum 200 ms) :
//   un téléphone lent analyse moins souvent au lieu d'être saturé ;
// - on fait une pause d'1,5 s dès que tu touches l'écran ailleurs que sur la vidéo,
//   pour que tes boutons répondent tout de suite.
const crop = document.createElement('canvas')
let pausedUntil = 0
function onPointerDown(e: PointerEvent) {
  if (!(e.target instanceof Element) || !e.target.closest('.viewport')) pausedUntil = Date.now() + 1500
}

/** Copie la bande centrale de l'image vidéo dans un petit canevas. */
function grabBand(v: HTMLVideoElement): HTMLCanvasElement {
  const vw = v.videoWidth
  const vh = v.videoHeight
  const cw = vw * 0.9
  const ch = vh * 0.5
  const scale = Math.min(1, 960 / cw)
  crop.width = Math.round(cw * scale)
  crop.height = Math.round(ch * scale)
  crop.getContext('2d', { willReadFrequently: true })!.drawImage(v, vw * 0.05, vh * 0.25, cw, ch, 0, 0, crop.width, crop.height)
  return crop
}

async function tick() {
  if (status.value !== 'running') return
  const v = video.value
  let delay = 200
  if (!props.paused && v && v.readyState >= 2 && v.videoWidth && Date.now() >= pausedUntil && !document.hidden) {
    const start = performance.now()
    try {
      const detector = await getDetector()
      handle((await detector.detect(grabBand(v))).map((r) => r.rawValue))
    } catch {
      // image illisible : on passe à la suivante
    }
    const took = performance.now() - start
    delay = Math.max(200, took * 2)
    recordScanFrame(took, delay)
  }
  timer = setTimeout(tick, delay)
}

function handle(rawCodes: string[]) {
  const now = Date.now()
  for (const raw of rawCodes) {
    const code = canonicalBarcode(raw)
    if (!isValidGtin(code)) continue
    // Confirmation : le même code doit être lu deux fois en moins d'1,5 s.
    if (pending?.code === code && now - pending.at < 1500) {
      pending = null
      // Anti-répétition : un même code n'est pas renvoyé pendant 4 s.
      if ((recentlySent.get(code) ?? 0) > now - 4000) continue
      recentlySent.set(code, now)
      flash.value = code
      setTimeout(() => (flash.value = ''), 900)
      emit('detected', code)
    } else {
      pending = { code, at: now }
    }
  }
}

async function toggleTorch() {
  const track = stream?.getVideoTracks()[0]
  if (!track) return
  torchOn.value = !torchOn.value
  try {
    await track.applyConstraints({ advanced: [{ torch: torchOn.value } as MediaTrackConstraintSet] })
  } catch {
    torchOn.value = false
  }
}

// On coupe la caméra quand l'appli passe en arrière-plan (économie de batterie), et on la rallume au retour.
let resumeOnVisible = false
function onVisibility() {
  if (document.hidden && status.value === 'running') {
    resumeOnVisible = true
    stop()
  } else if (!document.hidden && resumeOnVisible) {
    resumeOnVisible = false
    void start()
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true })
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  document.removeEventListener('pointerdown', onPointerDown, { capture: true })
  stop()
})

defineExpose({ start, stop })
</script>

<template>
  <div class="scanner">
    <div class="viewport" :class="{ hidden: status !== 'running' && status !== 'starting', compact }">
      <video ref="video" muted playsinline></video>
      <div class="guide" :class="{ ok: !!flash }"></div>
      <div v-if="flash" class="flash">✓ {{ flash }}</div>
      <button v-if="paused && status === 'running'" class="paused" @click="emit('resume')">
        Touchez pour scanner le CD suivant
      </button>
      <div v-if="status === 'starting'" class="starting">Démarrage de la caméra…</div>
    </div>

    <button v-if="status === 'idle' || status === 'error'" class="btn btn-primary btn-big" @click="start">
      📷 Démarrer la caméra
    </button>
    <p v-if="status === 'error'" class="notice notice-danger">{{ errorMessage }}</p>

    <div v-if="status === 'running'" class="row controls">
      <span class="muted small grow">Place le code-barres dans le cadre.</span>
      <button v-if="torchAvailable" class="btn btn-small" @click="toggleTorch">
        {{ torchOn ? '🔦 Éteindre' : '🔦 Lampe' }}
      </button>
      <button class="btn btn-small" @click="stop">Arrêter</button>
    </div>
  </div>
</template>

<style scoped>
.scanner {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.viewport {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  max-height: 45vh;
  background: #000;
  border-radius: var(--radius);
  overflow: hidden;
}
.viewport.compact {
  max-height: 26vh;
}
.viewport.hidden {
  display: none;
}
video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.guide {
  position: absolute;
  left: 10%;
  right: 10%;
  top: 32%;
  bottom: 32%;
  border: 3px solid rgba(255, 255, 255, 0.85);
  border-radius: 10px;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
  transition: border-color 0.15s;
}
.guide.ok {
  border-color: #4ade80;
}
.flash {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  background: #166534;
  color: #fff;
  padding: 6px 14px;
  border-radius: 999px;
  font-weight: 700;
}
.paused,
.starting {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font: inherit;
  font-size: 1.1rem;
  font-weight: 700;
  border: 0;
  cursor: pointer;
  padding: 16px;
  text-align: center;
}
.controls {
  min-height: 34px;
}
</style>
