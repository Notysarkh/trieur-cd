import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db, itemsOf } from '../db/database'
import type { Cd } from '../db/types'
import { MEDIA, mediaInfo, mediaOf } from './media'

const item = (id: string, media?: Cd['media']) => ({ id, media, artist: 'A', artistSort: 'A', title: id }) as Cd

describe('univers (v2)', () => {
  it('les fiches d’avant la v2 sont des CD', () => {
    expect(mediaOf({})).toBe('cd')
    expect(mediaOf({ media: 'livre' })).toBe('livre')
    expect(MEDIA.map((m) => m.id)).toEqual(['cd', 'livre', 'video', 'jeu'])
    expect(mediaInfo('jeu').label).toBe('Jeux vidéo')
  })

  it('chaque univers ne voit que ses fiches', async () => {
    await db.cds.bulkAdd([item('ancien-cd'), item('cd', 'cd'), item('livre', 'livre'), item('jeu', 'jeu')])
    expect((await itemsOf('cd')).map((c) => c.id).sort()).toEqual(['ancien-cd', 'cd'])
    expect((await itemsOf('livre')).map((c) => c.id)).toEqual(['livre'])
    expect(await itemsOf('video')).toEqual([])
  })
})
