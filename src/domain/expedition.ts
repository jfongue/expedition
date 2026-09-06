import { actionMinutes, travelMinutes, withPace, zoneOffers } from './cost'
import { estimate, sampleDuration, type Estimate } from './estimate'
import { drawEvent, EMPTY_EVENT_TABLE, type EventTable, type RandomEventDef } from './events'
import {
  returnBudget,
  schedulePlan,
  trimToFit,
  type PlanStep,
  type Schedule,
  type ScheduledKind,
} from './plan'
import type { Rng } from './rng'
import { phaseAt, type Minutes } from './time'
import type { ActionId, Explorer, World, ZoneId } from './types'

export type ExpeditionStatus = 'travelling' | 'acting' | 'returning' | 'finished'

export type ExpeditionOutcome =
  /** Back before sunset: the regular shuttle. */
  | 'on-time'
  /** Back after sunset but before the deadline: the expensive rescue shuttle. */
  | 'rescued'
  /** Still on the ground past the deadline. */
  | 'stranded'

/** A step in progress. `endsAt` is the real finish, which the explorer can't see. */
export interface Activity {
  step: ScheduledKind
  from: ZoneId
  to: ZoneId
  estimate: Estimate
  startedAt: Minutes
  endsAt: Minutes
}

export type LogEntry =
  | { at: Minutes; kind: 'depart'; zoneId: ZoneId }
  | { at: Minutes; kind: 'arrive'; zoneId: ZoneId }
  | { at: Minutes; kind: 'action-start'; zoneId: ZoneId; actionId: ActionId }
  | { at: Minutes; kind: 'action-done'; zoneId: ZoneId; actionId: ActionId }
  | { at: Minutes; kind: 'step-skipped'; zoneId: ZoneId; reason: 'unavailable' }
  | { at: Minutes; kind: 'event'; zoneId: ZoneId; event: RandomEventDef }
  | { at: Minutes; kind: 'auto-return'; zoneId: ZoneId; dropped: number }
  | { at: Minutes; kind: 'return-start'; zoneId: ZoneId }
  | { at: Minutes; kind: 'replan'; zoneId: ZoneId; steps: number }
  | { at: Minutes; kind: 'finished'; outcome: ExpeditionOutcome }

export interface ExpeditionState {
  now: Minutes
  zoneId: ZoneId
  status: ExpeditionStatus
  activity: Activity | null
  /** Authored steps not started yet. */
  pending: readonly PlanStep[]
  /** True once the plan was cut short to make the shuttle. */
  autoReturn: boolean
  /** Cumulative event malus on movement speed. */
  paceModifier: number
  /** Actions events have opened up, by zone. */
  unlocked: ReadonlyMap<ZoneId, ReadonlySet<ActionId>>
  /** Event delay waiting to be charged to the next step. */
  pendingDelay: Minutes
  outcome: ExpeditionOutcome | null
  log: readonly LogEntry[]
}

/**
 * Everything the simulation needs from outside itself. `rng` is the only
 * stateful piece: seed it and a run replays identically.
 */
export interface ExpeditionContext {
  world: World
  explorer: Explorer
  rng: Rng
  events?: EventTable
}

export interface StartOptions {
  plan: readonly PlanStep[]
  departAt: Minutes
  /** Defaults to the landing zone. */
  from?: ZoneId
}

export function startExpedition(ctx: ExpeditionContext, options: StartOptions): ExpeditionState {
  const { world } = ctx
  const from = options.from && world.hasZone(options.from) ? options.from : world.landingZoneId

  const base: ExpeditionState = {
    now: options.departAt,
    zoneId: from,
    status: 'travelling',
    activity: null,
    pending: [...options.plan],
    autoReturn: false,
    paceModifier: 1,
    unlocked: new Map(),
    pendingDelay: 0,
    outcome: null,
    log: [{ at: options.departAt, kind: 'depart', zoneId: from }],
  }

  return startNext(base, ctx)
}

/**
 * Runs the simulation forward to `until`. Steps that complete on the way are
 * resolved in order, events fire at step boundaries, and the return leg kicks
 * in by itself as soon as the remaining time stops being enough.
 */
export function advanceTo(state: ExpeditionState, until: Minutes, ctx: ExpeditionContext): ExpeditionState {
  if (until <= state.now) return state

  let current = state
  while (current.status !== 'finished') {
    const activity = current.activity
    if (!activity) {
      current = startNext({ ...current }, ctx)
      continue
    }
    if (activity.endsAt > until) break

    current = completeActivity({ ...current, now: activity.endsAt }, ctx)
  }

  return current.status === 'finished' ? current : { ...current, now: until }
}

export function advanceBy(state: ExpeditionState, minutes: Minutes, ctx: ExpeditionContext): ExpeditionState {
  return advanceTo(state, state.now + minutes, ctx)
}

/**
 * Replaces the steps not started yet. The current step keeps running — you
 * can't un-walk a leg — and the new tail is trimmed to whatever still fits.
 */
export function replan(
  state: ExpeditionState,
  steps: readonly PlanStep[],
  ctx: ExpeditionContext,
): ExpeditionState {
  if (state.status === 'finished') return state

  const activity = state.activity
  const fromZone = activity ? activity.to : state.zoneId
  const at = activity ? activity.startedAt + activity.estimate.expected : state.now

  const { steps: kept } = trimToFit(ctx.world, paced(state, ctx), steps, {
    departAt: at,
    from: fromZone,
    unlocked: state.unlocked,
  })

  return {
    ...state,
    pending: kept,
    autoReturn: false,
    log: [...state.log, { at: state.now, kind: 'replan', zoneId: state.zoneId, steps: kept.length }],
  }
}

/** Drop everything and head back — the manual version of the auto-return. */
export function abortToReturn(state: ExpeditionState, ctx: ExpeditionContext): ExpeditionState {
  if (state.status === 'finished' || state.status === 'returning') return state
  return beginReturn({ ...state, pending: [], autoReturn: true }, ctx)
}

/** Projection of what is left to do, from where the explorer stands now. */
export function projectedSchedule(state: ExpeditionState, ctx: ExpeditionContext): Schedule {
  return schedulePlan(ctx.world, paced(state, ctx), state.pending, {
    departAt: state.now,
    from: state.zoneId,
    unlocked: state.unlocked,
  })
}

/** Minutes left before the return leg has to start. Negative = already late. */
export function slackRemaining(state: ExpeditionState, ctx: ExpeditionContext): Minutes {
  const { world } = ctx
  const explorer = paced(state, ctx)
  const zone = state.activity ? state.activity.to : state.zoneId
  const at = state.activity ? state.activity.endsAt : state.now

  return world.cycle.sunset - world.safetyMargin - returnBudget(world, explorer, zone, at) - at
}

// --- internals ---------------------------------------------------------

function paced(state: ExpeditionState, ctx: ExpeditionContext): Explorer {
  return withPace(ctx.explorer, state.paceModifier)
}

function completeActivity(state: ExpeditionState, ctx: ExpeditionContext): ExpeditionState {
  const activity = state.activity
  if (!activity) return state

  const next: ExpeditionState = { ...state, activity: null, zoneId: activity.to }
  const log: LogEntry[] = [...state.log]

  if (activity.step.kind === 'act') {
    log.push({ at: next.now, kind: 'action-done', zoneId: activity.to, actionId: activity.step.action })
  } else {
    log.push({ at: next.now, kind: 'arrive', zoneId: activity.to })
  }

  // Arriving home ends the day — unless a replan queued something new while
  // the explorer was walking back, in which case they can set off again.
  if (activity.step.kind === 'return') return startNext({ ...next, log }, ctx)

  return startNext(applyEvent({ ...next, log }, ctx), ctx)
}

function applyEvent(state: ExpeditionState, ctx: ExpeditionContext): ExpeditionState {
  const table = ctx.events ?? EMPTY_EVENT_TABLE
  if (table.chancePerStep <= 0 || table.events.length === 0) return state

  const zone = ctx.world.zone(state.zoneId)
  const event = drawEvent(table, ctx.rng, {
    zoneId: zone.id,
    zoneKind: zone.kind,
    phase: phaseAt(ctx.world.cycle, state.now),
  })
  if (!event) return state

  const log: LogEntry[] = [...state.log, { at: state.now, kind: 'event', zoneId: zone.id, event }]

  switch (event.effect.type) {
    case 'delay':
      return { ...state, log, pendingDelay: state.pendingDelay + event.effect.minutes }
    case 'pace':
      return { ...state, log, paceModifier: state.paceModifier * event.effect.multiplier }
    case 'unlock': {
      const zoneId = event.effect.zone ?? zone.id
      const unlocked = new Map(state.unlocked)
      unlocked.set(zoneId, new Set([...(unlocked.get(zoneId) ?? []), event.effect.action]))
      return { ...state, log, unlocked }
    }
    case 'notice':
      return { ...state, log }
  }
}

/**
 * Decides what happens next. This is where the day's hard constraint lives:
 * a step only starts if, in the worst case, there is still time to walk home
 * afterwards. Otherwise the plan is abandoned and the return begins.
 */
function startNext(state: ExpeditionState, ctx: ExpeditionContext): ExpeditionState {
  const { world } = ctx
  const explorer = paced(state, ctx)

  if (state.autoReturn || state.pending.length === 0) return beginReturn(state, ctx)

  const [step, ...rest] = state.pending

  if (step.kind === 'act' && !zoneOffers(world, state.zoneId, step.action, state.unlocked)) {
    return startNext(
      {
        ...state,
        pending: rest,
        log: [...state.log, { at: state.now, kind: 'step-skipped', zoneId: state.zoneId, reason: 'unavailable' }],
      },
      ctx,
    )
  }

  const target = step.kind === 'move' ? step.to : state.zoneId
  const duration =
    step.kind === 'move'
      ? travelMinutes(world, explorer, state.zoneId, target)
      : actionMinutes(world, explorer, step.action)

  const est = estimate(duration + state.pendingDelay, {
    cycle: world.cycle,
    startAt: state.now,
    level: explorer.level,
  })

  const worstEnd = state.now + est.worstCase
  const latestArrival = worstEnd + returnBudget(world, explorer, target, worstEnd)

  if (latestArrival > world.cycle.sunset - world.safetyMargin) {
    return beginReturn(
      {
        ...state,
        autoReturn: true,
        pending: [],
        log: [
          ...state.log,
          { at: state.now, kind: 'auto-return', zoneId: state.zoneId, dropped: state.pending.length },
        ],
      },
      ctx,
    )
  }

  const log: LogEntry[] =
    step.kind === 'act'
      ? [...state.log, { at: state.now, kind: 'action-start', zoneId: state.zoneId, actionId: step.action }]
      : [...state.log]

  return {
    ...state,
    pending: rest,
    pendingDelay: 0,
    status: step.kind === 'move' ? 'travelling' : 'acting',
    log,
    activity: {
      step,
      from: state.zoneId,
      to: target,
      estimate: est,
      startedAt: state.now,
      endsAt: state.now + sampleDuration(est, ctx.rng),
    },
  }
}

function beginReturn(state: ExpeditionState, ctx: ExpeditionContext): ExpeditionState {
  const { world } = ctx
  const explorer = paced(state, ctx)
  const to = world.landingZoneId

  if (state.zoneId === to) return finish({ ...state, activity: null }, ctx)

  const est = estimate(travelMinutes(world, explorer, state.zoneId, to) + state.pendingDelay, {
    cycle: world.cycle,
    startAt: state.now,
    level: explorer.level,
  })

  return {
    ...state,
    status: 'returning',
    pending: [],
    pendingDelay: 0,
    log: [...state.log, { at: state.now, kind: 'return-start', zoneId: state.zoneId }],
    activity: {
      step: { kind: 'return', to },
      from: state.zoneId,
      to,
      estimate: est,
      startedAt: state.now,
      endsAt: state.now + sampleDuration(est, ctx.rng),
    },
  }
}

function finish(state: ExpeditionState, ctx: ExpeditionContext): ExpeditionState {
  const { cycle } = ctx.world
  const outcome: ExpeditionOutcome =
    state.now <= cycle.sunset ? 'on-time' : state.now <= cycle.deadline ? 'rescued' : 'stranded'

  return {
    ...state,
    status: 'finished',
    activity: null,
    outcome,
    log: [...state.log, { at: state.now, kind: 'finished', outcome }],
  }
}
