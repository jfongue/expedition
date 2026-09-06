import { describe, expect, it } from 'vitest'
import { ITEM_VALUES } from './continent'
import { settle } from './settle'

const loot = { metal: 4, crystal: 1 } // 4x5 + 20 = 40
const base = { loot, xp: 50, taxRate: 10, values: ITEM_VALUES } as const

describe('settle', () => {
  it('takes the base cut off a clean return', () => {
    const result = settle({ ...base, outcome: 'on-time' })

    expect(result.gross).toBe(40)
    expect(result.tax).toBe(4)
    expect(result.rescueFee).toBe(0)
    expect(result.net).toBe(36)
    expect(result.xp).toBe(50)
  })

  it('charges the rescue shuttle on top of the tax', () => {
    const result = settle({ ...base, outcome: 'rescued' })

    expect(result.rescueFee).toBe(60) // the floor, since 40% of 40 is less
    expect(result.net).toBe(0) // the fee swallows the day
    expect(result.lootKept).toEqual(loot)
  })

  it('loses the haul when the explorer is stranded', () => {
    const result = settle({ ...base, outcome: 'stranded' })

    expect(result.lootKept).toEqual({})
    expect(result.gross).toBe(0)
    expect(result.net).toBe(0)
    expect(result.xp).toBe(13)
  })

  it('pays the objective bonus only when it was met', () => {
    const met = settle({ ...base, outcome: 'on-time', objectiveMet: true, objectiveBonus: 100 })
    const missed = settle({ ...base, outcome: 'on-time', objectiveMet: false, objectiveBonus: 100 })

    expect(met.net - missed.net).toBe(100)
  })

  it('values the haul higher for a trained eye', () => {
    const trained = settle({ ...base, outcome: 'on-time', valueMultiplier: 1.12 })

    expect(trained.gross).toBe(45)
    expect(trained.net).toBeGreaterThan(settle({ ...base, outcome: 'on-time' }).net)
  })
})
