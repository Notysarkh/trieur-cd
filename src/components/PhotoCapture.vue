<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { photoToThumbnail, videoToThumbnail } from '../lib/image'
import { cameraErrorMessage, closeCamera, openCamera } from '../lib/camera'

// Photo de pochette : ouvre directement la caméra DANS l'appli (au lieu du sélecteur de fichiers,
// que certains téléphones Android affichent même quand on demande la caméra).
// En secours, on peut toujours choisir une image existante.

const props = defineProps<{
  hasPhoto: boolean
  /** Grande image (lecture des titres par l'IA) au lieu d'une petite vignette. */
  hd?: boolean
  /** Texte du bouton (par défaut « Prendre une photo »). */
  label?: string
  /** Taille maximale de l'image (pixels) ; par défaut 320 (vignette), 1568 avec hd. */
  maxSize?: number
}>()
const maxSize = () => props.maxSize ?? (props.hd ? 1568 : 320)
const emit = defineEmits<{ photo: [dataUrl: string] }>()

const video = ref<HTMLVideoElement>()
const open = ref(false)
const error = ref('')
let stream: MediaStream | null = null
let generation = 0

async function start() {
  error.value = ''
  open.value = true
  const mine = ++generation
  try {
    const s = await openCamera({ width: props.hd ? 1920 : 1280, height: props.hd ? 1920 : 1280 })
    await nextTick()
    // Annulé (ou écran quitté) pendant l'ouverture : on referme tout de suite.
    if (mine !== generation || !video.value) {
      closeCamera(s)
      return
    }
    stream = s
    video.value.srcObject = stream
    await video.value!.play()
  } catch (e) {
    stop()
    open.value = false
    error.value = `${cameraErrorMessage(e)} Tu peux aussi choisir une image existante.`
  }
}

function stop() {
  generation++
  closeCamera(stream)
  stream = null
}

function shoot() {
  const v = video.value
  if (!v?.videoWidth) return
  emit('photo', videoToThumbnail(v, maxSize()))
  stop()
  open.value = false
}

function cancel() {
  stop()
  open.value = false
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('photo', await photoToThumbnail(file, maxSize()))
}

onBeforeUnmount(stop)
</script>

<template>
  <div class="stack">
    <div v-if="open" class="camera">
      <video ref="video" muted playsinline></video>
      <div class="row actions">
        <button class="btn btn-primary grow" @click="shoot">📸 Déclencher</button>
        <button class="btn" @click="cancel">Annuler</button>
      </div>
    </div>
    <div v-else class="row">
      <button class="btn" @click="start">📷 {{ props.label ?? (props.hasPhoto ? 'Reprendre la photo' : 'Prendre une photo') }}</button>
      <label class="btn btn-small">
        🖼️ Choisir une image
        <input type="file" accept="image/*" hidden @change="onFile" />
      </label>
    </div>
    <p v-if="error" class="notice notice-warn small">{{ error }}</p>
  </div>
</template>

<style scoped>
.camera {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
video {
  width: 100%;
  max-height: 55vh;
  background: #000;
  border-radius: var(--radius);
  object-fit: cover;
}
</style>
