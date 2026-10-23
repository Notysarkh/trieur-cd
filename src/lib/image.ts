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
