import { actionMinutes, travelMinutes, zoneOffers } from './cost'
import { estimate, type Estimate } from './estimate'
import type { Minutes } from './time'
import type { ActionId, Explorer, World, ZoneId } from './types'

/** What the player queues up by clicking the map and picking actions. */
export type PlanStep =
  | { kind: 'move'; to: ZoneId }
  | { kind: 'act'; action: ActionId }

/** The mandatory last leg. Never authored by the player, always appended. */
export interface ReturnStep {
  kind: 'return'
  to: ZoneId
}

export type ScheduledKind = PlanStep | ReturnStep

export interface ScheduledStep {
  /** Index into the authored plan, or -1 for the return leg. */
  index: number
  step: ScheduledKind
  from: ZoneId
  to: ZoneId
  estimate: Estimate
  startAt: Minutes
  /** Expected finish — what the planning UI shows. */
  endAt: Minutes
  /** Finish if every step so far runs to its worst case. */
  worstCaseEndAt: Minutes
}

export type PlanProblem =
  | { kind: 'unknown-zone'; index: number; zoneId: ZoneId }
  | { kind: 'unknown-action'; index: number; actionId: ActionId }
  | { kind: 'action-unavailable'; index: number; actionId: ActionId; zoneId: ZoneId }
  | { kind: 'redundant-move'; index: number; zoneId: ZoneId }
  | { kind: 'no-time'; overshoot: Minutes }

export interface Schedule {
  departAt: Minutes
  startZone: ZoneId
  /** Authored steps plus the return leg, in order. */
  steps: readonly ScheduledStep[]
  returnLeg: ScheduledStep
  /** Expected minute of arrival back at the landing zone. */
  arrivalAt: Minutes
  worstCaseArrivalAt: Minutes
  /** Room left before sunset in the worst case. Negative means it won't fit. */
  slack: Minutes
  fits: boolean
  problems: readonly PlanProblem[]
}

export interface ScheduleOptions {
  departAt: Minutes
  /** Where the explorer stands now. Defaults to the landing zone. */
  from?: ZoneId
  /** Extra actions events have unlocked, per zone. */
  unlocked?: ReadonlyMap<ZoneId, ReadonlySet<ActionId>>
}

/**
 * Lays a plan out on the clock. Pure: same inputs, same schedule — no sampling
 * happens here, only estimates. The return leg is always appended, so a plan
 * is never allowed to be a one-way trip.
 */
export function schedulePlan(
  world: World,
  explorer: Explorer,
  steps: readonly PlanStep[],
  options: ScheduleOptions,
): Schedule {
  const { departAt, from = world.landingZoneId, unlocked } = options
  const problems: PlanProblem[] = []
  const scheduled: ScheduledStep[] = []

  let cursor = world.hasZone(from) ? from : world.landingZoneId
  let expectedClock = departAt
  let worstClock = departAt

  steps.forEach((step, index) => {
    let duration: Minutes
    let target = cursor

    if (step.kind === 'move') {
      if (!world.hasZone(step.to)) {
        problems.push({ kind: 'unknown-zone', index, zoneId: step.to })
        return
      }
      if (step.to === cursor) problems.push({ kind: 'redundant-move', index, zoneId: step.to })
      target = step.to
      duration = travelMinutes(world, explorer, cursor, target)
    } else {
      if (!world.hasAction(step.action)) {
        problems.push({ kind: 'unknown-action', index, actionId: step.action })
        return
      }
      if (!zoneOffers(world, cursor, step.action, unlocked)) {
        problems.push({ kind: 'action-unavailable', index, actionId: step.action, zoneId: cursor })
      }
      duration = actionMinutes(world, explorer, step.action)
    }

    const est = estimate(duration, {
      cycle: world.cycle,
      startAt: expectedClock,
      level: explorer.level,
    })

    scheduled.push({
      index,
      step,
      from: cursor,
      to: target,
      estimate: est,
      startAt: expectedClock,
      endAt: expectedClock + est.expected,
      worstCaseEndAt: worstClock + est.worstCase,
    })

    expectedClock += est.expected
    worstClock += est.worstCase
    cursor = target
  })

  const returnLeg = scheduleReturn(world, explorer, cursor, expectedClock, worstClock)
  scheduled.push(returnLeg)

  const arrivalAt = returnLeg.endAt
  const worstCaseArrivalAt = returnLeg.worstCaseEndAt
  const slack = world.cycle.sunset - worstCaseArrivalAt

  if (slack < world.safetyMargin) {
    problems.push({ kind: 'no-time', overshoot: world.safetyMargin - slack })
  }

  return {
    departAt,
    startZone: from,
    steps: scheduled,
    returnLeg,
    arrivalAt,
    worstCaseArrivalAt,
    slack,
    fits: problems.length === 0,
    problems,
  }
}

function scheduleReturn(
  world: World,
  explorer: Explorer,
  from: ZoneId,
  expectedClock: Minutes,
  worstClock: Minutes,
): ScheduledStep {
  const to = world.landingZoneId
  const est = estimate(travelMinutes(world, explorer, from, to), {
    cycle: world.cycle,
    startAt: expectedClock,
    level: explorer.level,
  })

  return {
    index: -1,
    step: { kind: 'return', to },
    from,
    to,
    estimate: est,
    startAt: expectedClock,
    endAt: expectedClock + est.expected,
    worstCaseEndAt: worstClock + est.worstCase,
  }
}

/**
 * Worst-case minutes needed to get back to the ship from `from`, starting at
 * `at`. This is the number the whole day is budgeted against.
 */
export function returnBudget(
  world: World,
  explorer: Explorer,
  from: ZoneId,
  at: Minutes,
): Minutes {
  return estimate(travelMinutes(world, explorer, from, world.landingZoneId), {
    cycle: world.cycle,
    startAt: at,
    level: explorer.level,
  }).worstCase
}

/**
 * The latest minute at which the explorer can still leave `from` and expect to
 * make the shuttle. Past it, the return is no longer optional.
 */
export function pointOfNoReturn(
  world: World,
  explorer: Explorer,
  from: ZoneId,
  at: Minutes,
): Minutes {
  return world.cycle.sunset - world.safetyMargin - returnBudget(world, explorer, from, at)
}

/** Minutes of usable time left before the return has to start. Can go negative. */
export function timeRemaining(
  world: World,
  explorer: Explorer,
  from: ZoneId,
  at: Minutes,
): Minutes {
  return pointOfNoReturn(world, explorer, from, at) - at
}

/**
 * Longest prefix of `steps` that still gets the explorer home in time — what
 * the planner falls back to when the player queues one action too many.
 */
export function trimToFit(
  world: World,
  explorer: Explorer,
  steps: readonly PlanStep[],
  options: ScheduleOptions,
): { steps: PlanStep[]; schedule: Schedule } {
  for (let length = steps.length; length > 0; length--) {
    const candidate = steps.slice(0, length)
    const schedule = schedulePlan(world, explorer, candidate, options)
    if (schedule.fits) return { steps: candidate, schedule }
  }

  return { steps: [], schedule: schedulePlan(world, explorer, [], options) }
}

/** Can this step be tacked onto the end of the plan and still fit? */
export function canAppend(
  world: World,
  explorer: Explorer,
  steps: readonly PlanStep[],
  step: PlanStep,
  options: ScheduleOptions,
): boolean {
  return schedulePlan(world, explorer, [...steps, step], options).fits
}
