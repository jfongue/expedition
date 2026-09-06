import { describe, expect, it } from 'vitest'
import {
  emptyProgress, explorerFrom, levelFromXp, levelProgress, sunriseShiftFrom,
  terrainReliefFrom, upgradeCost, UPGRADES, xpForLevel,
} from './progression'

describe('levels', () => {
  it('starts at 1 and rises with xp', () => {
    expect(levelFromXp(0)).toBe(1)
    expect(levelFromXp(59)).toBe(1)
    expect(levelFromXp(60)).toBe(2)
    expect(levelFromXp(240)).toBe(3)
  })

  it('round-trips through xpForLevel', () => {
    for (let level = 1; level <= 8; level++) {
      expect(levelFromXp(xpForLevel(level))).toBe(level)
    }
  })

  it('reports progress inside the current level', () => {
    expect(levelProgress(60)).toBe(0)
    expect(levelProgress(150)).toBeCloseTo(0.5, 5)
  })
})

describe('upgradeCost', () => {
  it('rises with each level bought', () => {
    const first = upgradeCost('endurance', {})!
    const second = upgradeCost('endurance', { endurance: 1 })!

    expect(second).toBeGreaterThan(first)
  })

  it('returns null at max level and for unknown codes', () => {
    expect(upgradeCost('swimming', { swimming: 3 })).toBeNull()
    expect(upgradeCost('nope', {})).toBeNull()
  })

  it('is discounted by the workbench', () => {
    expect(upgradeCost('endurance', { workbench: 3 })!).toBeLessThan(upgradeCost('endurance', {})!)
  })
})

describe('explorerFrom', () => {
  it('leaves a fresh explorer at the baseline', () => {
    const explorer = explorerFrom(emptyProgress('p1'))

    expect(explorer.pace).toBe(1)
    expect(explorer.level).toBe(1)
  })

  it('turns capacities into pace and knowledge into estimate quality', () => {
    const explorer = explorerFrom({
      playerId: 'p1', xp: 240, credits: 0, rested: false,
      upgrades: { endurance: 3, comfort: 2, shortcuts: 2, mining: 4 },
    })

    expect(explorer.pace).toBeCloseTo(1 + 0.18 + 0.04, 5)
    expect(explorer.level).toBe(3 + 2)
    expect(explorer.skills.mining).toBe(4)
  })

  it('pays off a day spent at camp', () => {
    const base = { playerId: 'p1', xp: 0, credits: 0, upgrades: {} }
    const rested = explorerFrom({ ...base, rested: true })

    expect(rested.pace).toBeCloseTo(1.1, 5)
    expect(rested.level).toBe(explorerFrom({ ...base, rested: false }).level + 1)
  })
})

describe('terrain relief', () => {
  it('eases only the terrain the capacity covers', () => {
    const relief = terrainReliefFrom({ climbing: 2, swimming: 1 })

    expect(relief.mountain).toBeCloseTo(0.82, 5)
    expect(relief.cave).toBeCloseTo(0.82, 5)
    expect(relief.swamp).toBeCloseTo(0.9, 5)
    expect(relief.forest).toBeUndefined()
  })

  it('gets the explorer up earlier with a better room', () => {
    expect(sunriseShiftFrom({})).toBe(0)
    expect(sunriseShiftFrom({ room: 3 })).toBe(-36)
  })
})

describe('the upgrade catalogue', () => {
  it('describes a mechanical effect for every entry', () => {
    for (const upgrade of UPGRADES) {
      expect(upgrade.effect.length).toBeGreaterThan(0)
      expect(upgrade.maxLevel).toBeGreaterThanOrEqual(1)
    }
  })
})
