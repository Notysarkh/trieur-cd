import { describe, expect, it } from 'vitest'
import type { Cd } from '../db/types'
import { shelvedToKeep } from './keepShelved'

const cd = (id: string, slotId: string, position: number, shelved = true): Cd =>
  ({ id, location: { furnitureId: 'f', slotId, position }, shelvedAt: shelved ? 1 : undefined }) as Cd

describe('réappliquer sans tout déplacer', () => {
  it('garde les CD rangés qui restent dans la même rangée et le même ordre', () => {
    const cds = [cd('A', 'r1', 1), cd('B', 'r1', 2), cd('C', 'r1', 3)]
    // Deux nouveaux CD insérés devant : tout glisse, mais l'ordre est le même
    const placement = new Map([
      ['A', { slotId: 'r1', position: 3 }],
      ['B', { slotId: 'r1', position: 4 }],
      ['C', { slotId: 'r1', position: 5 }],
    ])
    expect([...shelvedToKeep(cds, placement)].sort()).toEqual(['A', 'B', 'C'])
  })

  it('ne fait déplacer que le minimum quand l’ordre change', () => {
    const cds = [cd('A', 'r1', 1), cd('B', 'r1', 2), cd('C', 'r1', 3), cd('D', 'r1', 4)]
    // Nouveau plan : A C D B → seul B est à déplacer
    const placement = new Map([
      ['A', { slotId: 'r1', position: 1 }],
      ['C', { slotId: 'r1', position: 2 }],
      ['D', { slotId: 'r1', position: 3 }],
      ['B', { slotId: 'r1', position: 4 }],
    ])
    expect([...shelvedToKeep(cds, placement)].sort()).toEqual(['A', 'C', 'D'])
  })

  it('un CD qui change de rangée est à déplacer ; un CD pas encore rangé ne compte pas', () => {
    const cds = [cd('A', 'r1', 1), cd('B', 'r1', 2), cd('X', 'r1', 3, false)]
    const placement = new Map([
      ['A', { slotId: 'r2', position: 1 }],
      ['B', { slotId: 'r1', position: 1 }],
      ['X', { slotId: 'r1', position: 2 }],
    ])
    expect([...shelvedToKeep(cds, placement)]).toEqual(['B'])
  })
})
