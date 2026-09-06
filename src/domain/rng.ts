/**
 * Deterministic RNG. The domain never reaches for Math.random: every run is
 * reproducible from its seed, which is what makes the simulation testable and
 * what will let the server replay a client's day later on.
 */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

/** An RNG that always returns `value` — handy for deterministic tests. */
export function fixedRng(value: number): Rng {
  return { next: () => value }
}

export function randomBetween(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min)
}

export function pickWeighted<T>(rng: Rng, items: readonly T[], weightOf: (item: T) => number): T | null {
  const total = items.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0)
  if (total <= 0) return null

  let roll = rng.next() * total
  for (const item of items) {
    roll -= Math.max(0, weightOf(item))
    if (roll < 0) return item
  }
  return items[items.length - 1] ?? null
}
