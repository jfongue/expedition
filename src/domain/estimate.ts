import { clamp01, dayProgress, type DayCycle, type Minutes } from './time'
import { randomBetween, type Rng } from './rng'

/**
 * What the explorer *thinks* a step will take. `expected` is what the planner
 * shows; `worstCase` is what the auto-return logic budgets against.
 */
export interface Estimate {
  expected: Minutes
  worstCase: Minutes
  /** Relative spread, e.g. 0.2 = "could run 20% long". */
  uncertainty: number
}

export interface EstimateContext {
  cycle: DayCycle
  /** When the step is expected to start. Late steps are harder to read. */
  startAt: Minutes
  level: number
}

const BASE_UNCERTAINTY = 0.08
const LATENESS_WEIGHT = 0.22
const MAX_UNCERTAINTY = 0.6
const MIN_UNCERTAINTY = 0.02

/**
 * Reliability of a time estimate. Two levers, both from the design: estimates
 * are sharper early in the run, and sharper as the explorer levels up.
 */
export function uncertaintyAt({ cycle, startAt, level }: EstimateContext): number {
  const lateness = dayProgress(cycle, startAt)
  const experience = 1 / (1 + Math.max(0, level - 1) * 0.18)
  const raw = (BASE_UNCERTAINTY + LATENESS_WEIGHT * lateness * lateness) * experience

  return clamp(raw, MIN_UNCERTAINTY, MAX_UNCERTAINTY)
}

export function estimate(trueDuration: Minutes, context: EstimateContext): Estimate {
  const uncertainty = uncertaintyAt(context)
  const expected = Math.max(0, Math.round(trueDuration))

  return {
    expected,
    worstCase: Math.round(expected * (1 + uncertainty)),
    uncertainty,
  }
}

/**
 * The duration the world actually serves up. Skewed slightly pessimistic:
 * a step is more likely to run long than short, which is what makes the
 * safety margin worth having.
 */
export function sampleDuration(est: Estimate, rng: Rng): Minutes {
  if (est.expected === 0) return 0

  const low = est.expected * (1 - est.uncertainty * 0.5)
  const high = est.worstCase
  const roll = clamp01(Math.pow(rng.next(), 0.8))

  return Math.max(1, Math.round(randomBetween({ next: () => roll }, low, high)))
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
