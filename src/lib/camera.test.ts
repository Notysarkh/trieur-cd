import { afterEach, describe, expect, it, vi } from 'vitest'
import { cameraErrorMessage, closeAllCameras, openCamera, pickMainBack } from './camera'

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
    // 1er essai : caméra arrière exigée ; ensuite souhaitée.
    expect(getUserMedia.mock.calls[0][0].video.facingMode).toEqual({ exact: 'environment' })
    expect(getUserMedia.mock.calls[2][0].video.facingMode).toEqual({ ideal: 'environment' })
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

describe('caméra arrière principale', () => {
  const cam = (deviceId: string, label: string) => ({ deviceId, label, kind: 'videoinput' })
  it('Android : « camera2 0, facing back »', () => {
    expect(
      pickMainBack([cam('f', 'camera2 1, facing front'), cam('w', 'camera2 2, facing back'), cam('m', 'camera2 0, facing back'), cam('t', 'camera2 3, facing back')]),
    ).toBe('m')
  })
  it('iPhone : « Caméra arrière » plutôt que l’ultra grand-angle ou le téléobjectif', () => {
    expect(
      pickMainBack([
        cam('u', 'Caméra ultra grand-angle arrière'),
        cam('d', 'Caméra double grand-angle arrière'),
        cam('m', 'Caméra arrière'),
        cam('t', 'Caméra téléobjectif arrière'),
        cam('f', 'Caméra avant'),
      ]),
    ).toBe('m')
    expect(pickMainBack([cam('u', 'Back Ultra Wide Camera'), cam('m', 'Back Camera')])).toBe('m')
  })
  it('ordinateur sans caméra arrière : rien à imposer', () => {
    expect(pickMainBack([cam('x', 'HD Webcam (046d:0825)')])).toBeUndefined()
  })
})

describe('bascule sur la caméra principale', () => {
  it('le navigateur a ouvert l’ultra grand-angle : on rouvre la principale', async () => {
    const make = (id: string) => {
      const track = { stop: vi.fn(), addEventListener: vi.fn(), getSettings: () => ({ deviceId: id }) }
      return { getTracks: () => [track], getVideoTracks: () => [track], track } as unknown as MediaStream & { track: { stop: ReturnType<typeof vi.fn> } }
    }
    const wide = make('w')
    const main = make('m')
    const getUserMedia = vi.fn().mockResolvedValueOnce(wide).mockResolvedValueOnce(main)
    const enumerateDevices = vi.fn().mockResolvedValue([
      { deviceId: 'w', label: 'camera2 2, facing back', kind: 'videoinput' },
      { deviceId: 'm', label: 'camera2 0, facing back', kind: 'videoinput' },
    ])
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia, enumerateDevices } })
    expect(await openCamera({ width: 1280, height: 720 })).toBe(main)
    expect(wide.track.stop).toHaveBeenCalled()
    expect(getUserMedia.mock.calls[1][0].video.deviceId).toEqual({ exact: 'm' })
  })
})
