/**
 * Réduit une photo (ex. 4000 px prise au téléphone) en petite vignette JPEG,
 * pour ne pas encombrer la base : environ 20 Ko par pochette.
 */
export async function photoToThumbnail(file: File, maxSize = 320): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.75)
}

/** Capture l'image actuelle d'une vidéo (caméra) en petite vignette JPEG. */
export function videoToThumbnail(video: HTMLVideoElement, maxSize = 320): string {
  const scale = Math.min(1, maxSize / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8)
}
