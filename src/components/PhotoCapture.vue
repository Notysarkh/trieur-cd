<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { photoToThumbnail, videoToThumbnail } from '../lib/image'

// Photo de pochette : ouvre directement la caméra DANS l'appli (au lieu du sélecteur de fichiers,
// que certains téléphones Android affichent même quand on demande la caméra).
// En secours, on peut toujours choisir une image existante.

const props = defineProps<{ hasPhoto: boolean }>()
const emit = defineEmits<{ photo: [dataUrl: string] }>()

const video = ref<HTMLVideoElement>()
const open = ref(false)
const error = ref('')
let stream: MediaStream | null = null

async function start() {
  error.value = ''
  open.value = true
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Caméra non disponible sur ce navigateur.')
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    })
    await nextTick()
    video.value!.srcObject = stream
    await video.value!.play()
  } catch (e) {
    stop()
    open.value = false
    const name = e instanceof DOMException ? e.name : ''
    error.value =
      name === 'NotAllowedError'
        ? "L'accès à la caméra a été refusé. Autorise-le dans les réglages du navigateur, ou choisis une image existante."
        : "Impossible d'ouvrir la caméra. Tu peux choisir une image existante."
  }
}

function stop() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}

function shoot() {
  const v = video.value
  if (!v?.videoWidth) return
  emit('photo', videoToThumbnail(v))
  stop()
  open.value = false
}

function cancel() {
  stop()
  open.value = false
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('photo', await photoToThumbnail(file))
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
      <button class="btn" @click="start">📷 {{ props.hasPhoto ? 'Reprendre la photo' : 'Prendre une photo' }}</button>
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
