import { computed } from 'vue'
import { mediaInfo } from '../lib/media'
import { currentMedia } from '../services/settings'

/** L'univers en cours et ses mots (« CD », « livre », « film », « jeu »), pour les écrans communs. */
export function useMedia() {
  const media = computed(() => currentMedia())
  const w = computed(() => mediaInfo(media.value))
  return { media, w }
}
