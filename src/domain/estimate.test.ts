import { describe, expect, it } from 'vitest'
import { estimate, sampleDuration, uncertaintyAt } from './estimate'
import { createRng, fixedRng } from './rng'
import { DEFAULT_CYCLE } from './time'

const cycle = DEFAULT_CYCLE

describe('estimate reliability', () => {
  it('degrades as the day wears on', () => {
    const morning = uncertaintyAt({ cycle, startAt: 7 * 60, level: 1 })
    const afternoon = uncertaintyAt({ cycle, startAt: 15 * 60, level: 1 })
    const dusk = uncertaintyAt({ cycle, startAt: 19 * 60, level: 1 })

    expect(morning).toBeLessThan(afternoon)
    expect(afternoon).toBeLessThan(dusk)
  })

  it('improves with the explorer level', () => {
    const rookie = uncertaintyAt({ cycle, startAt: 15 * 60, level: 1 })
    const veteran = uncertaintyAt({ cycle, startAt: 15 * 60, level: 10 })

    expect(veteran).toBeLessThan(rookie)
  })

  it('brackets the expected duration with a worst case', () => {
    const est = estimate(60, { cycle, startAt: 15 * 60, level: 1 })

    expect(est.expected).toBe(60)
    expect(est.worstCase).toBeGreaterThan(est.expected)
  })

  it('samples inside the bracket, and deterministically for a given seed', () => {
    const est = estimate(60, { cycle, startAt: 15 * 60, level: 1 })
    const rng = createRng(7)

    for (let i = 0; i < 200; i++) {
      const sampled = sampleDuration(est, rng)
      expect(sampled).toBeGreaterThanOrEqual(Math.round(est.expected * (1 - est.uncertainty * 0.5)))
      expect(sampled).toBeLessThanOrEqual(est.worstCase)
    }

    expect(sampleDuration(est, createRng(3))).toBe(sampleDuration(est, createRng(3)))
    expect(sampleDuration(est, fixedRng(1))).toBe(est.worstCase)
  })
})
