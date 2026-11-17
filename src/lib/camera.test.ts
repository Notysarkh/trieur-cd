import { afterEach, describe, expect, it, vi } from 'vitest'
import { cameraErrorMessage, closeAllCameras, openCamera } from './camera'

// Caméra occupée (« Could not start video source ») : on referme ce que l'appli tenait encore et on réessaie.

function fakeStream() {
  const track = { stop: vi.fn(), addEventListener: vi.fn() }
  return { getTracks: () => [track], getVideoTracks: () => [track], track } as unknown as MediaStream & { track: { stop: ReturnType<typeof vi.fn> } }
}
const busy = () => Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' })

afterEach(() => {
  closeAllCameras()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('caméra', () => {
  it('referme une caméra restée ouverte avant d’en ouvrir une autre', async () => {
    const a = fakeStream()
    const b = fakeStream()
    const getUserMedia = vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(b)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    await openCamera({ width: 1280, height: 720 })
    // L'écran précédent n'a pas refermé « a » : la nouvelle ouverture s'en charge.
    await openCamera({ width: 1920, height: 1920 })
    expect(a.track.stop).toHaveBeenCalled()
    expect(b.track.stop).not.toHaveBeenCalled()
  })

  it('caméra occupée : réessaie, puis avec des réglages plus simples', async () => {
    vi.useFakeTimers()
    const ok = fakeStream()
    const getUserMedia = vi.fn().mockRejectedValueOnce(busy()).mockRejectedValueOnce(busy()).mockResolvedValueOnce(ok)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    const p = openCamera({ width: 1280, height: 720 })
    await vi.runAllTimersAsync()
    expect(await p).toBe(ok)
    expect(getUserMedia).toHaveBeenCalledTimes(3)
    expect(getUserMedia.mock.calls[2][0]).toEqual({ video: { facingMode: { ideal: 'environment' } }, audio: false })
  })

  it('accès refusé : pas de nouvel essai, message clair', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    const getUserMedia = vi.fn().mockRejectedValue(denied)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    await expect(openCamera({ width: 1, height: 1 })).rejects.toBe(denied)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(cameraErrorMessage(busy())).toMatch(/occupée/)
  })
})
