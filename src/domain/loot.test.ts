import { describe, expect, it } from 'vitest'
import { CONTINENT_ACTIONS, ITEM_VALUES } from './continent'
import { bagValue, haulFromLog, lootRulesFrom, mergeBags, resolveActionLoot } from './loot'
import { createRng } from './rng'
import { createExplorer } from './types'
import type { LogEntry } from './expedition'

const rules = lootRulesFrom(CONTINENT_ACTIONS)
const explorer = createExplorer({ id: 'p1' })

describe('resolveActionLoot', () => {
  it('yields nothing for an action with no loot table', () => {
    expect(resolveActionLoot(rules, explorer, 'explore', createRng(1))).toEqual({})
  })

  it('always returns the whole part of a yield', () => {
    // mine yields metal 3: even the worst roll (x0.6) leaves one whole unit.
    for (let seed = 0; seed < 40; seed++) {
      const bag = resolveActionLoot(rules, explorer, 'mine', createRng(seed))
      expect(bag.metal).toBeGreaterThanOrEqual(1)
    }
  })

  it('treats a fractional yield as a drop chance', () => {
    const drops = Array.from({ length: 200 }, (_, seed) =>
      resolveActionLoot(rules, explorer, 'scavenge', createRng(seed)).relic ?? 0,
    )
    const found = drops.filter((quantity) => quantity > 0).length

    expect(found).toBeGreaterThan(0)
    expect(found).toBeLessThan(drops.length)
  })

  it('pays the matching skill', () => {
    const miner = createExplorer({ id: 'p2', skills: { mining: 5 } })
    const total = (level: typeof explorer) =>
      Array.from({ length: 60 }, (_, seed) =>
        bagValue(resolveActionLoot(rules, level, 'mine', createRng(seed)), ITEM_VALUES),
      ).reduce((a, b) => a + b, 0)

    expect(total(miner)).toBeGreaterThan(total(explorer))
  })
})

describe('haulFromLog', () => {
  const log: LogEntry[] = [
    { at: 400, kind: 'action-done', zoneId: 'crete-fer', actionId: 'mine' },
    { at: 460, kind: 'action-done', zoneId: 'crete-fer', actionId: 'explore' },
  ]

  it('is stable as the log grows', () => {
    const partial = haulFromLog(log.slice(0, 1), rules, explorer, 42)
    const full = haulFromLog(log, rules, explorer, 42)

    expect(full.loot.metal).toBe(partial.loot.metal)
    expect(full.xp).toBe(partial.xp + 25)
  })

  it('is reproducible from its seed and changes with it', () => {
    expect(haulFromLog(log, rules, explorer, 7)).toEqual(haulFromLog(log, rules, explorer, 7))
    expect(haulFromLog(log, rules, explorer, 7).loot).not.toEqual(
      haulFromLog(log, rules, explorer, 99999).loot,
    )
  })

  it('ignores steps that are not completed actions', () => {
    const haul = haulFromLog(
      [{ at: 0, kind: 'depart', zoneId: 'base-nord' }, { at: 10, kind: 'arrive', zoneId: 'crete-fer' }],
      rules,
      explorer,
      1,
    )

    expect(haul).toEqual({ loot: {}, xp: 0 })
  })
})

describe('mergeBags', () => {
  it('sums quantities per item', () => {
    expect(mergeBags({ wood: 2 }, { wood: 3, metal: 1 }, {})).toEqual({ wood: 5, metal: 1 })
  })
})
