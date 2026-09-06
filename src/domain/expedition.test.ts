import { describe, expect, it } from 'vitest'
import {
  abortToReturn,
  advanceTo,
  projectedSchedule,
  replan,
  slackRemaining,
  startExpedition,
  type ExpeditionContext,
  type ExpeditionState,
  type LogEntry,
} from './expedition'
import type { EventTable } from './events'
import type { PlanStep } from './plan'
import { createDemoWorld, DEMO_EVENTS } from './presets'
import { createRng, fixedRng } from './rng'
import { MINUTES_PER_DAY } from './time'
import { createExplorer } from './types'

const world = createDemoWorld()
const explorer = createExplorer({ id: 'e1', level: 3, skills: { mining: 2 } })
const sunrise = world.cycle.sunrise

function context(overrides: Partial<ExpeditionContext> = {}): ExpeditionContext {
  return { world, explorer, rng: createRng(42), ...overrides }
}

/** Runs a whole day minute-free: jump straight to the end of the cycle. */
function runToEnd(state: ExpeditionState, ctx: ExpeditionContext): ExpeditionState {
  return advanceTo(state, MINUTES_PER_DAY * 2, ctx)
}

const kinds = (log: readonly LogEntry[]) => log.map((entry) => entry.kind)

describe('running an expedition', () => {
  it('walks the plan, returns to the landing zone and lands on time', () => {
    const ctx = context()
    const plan: PlanStep[] = [
      { kind: 'move', to: 'iron-vein' },
      { kind: 'act', action: 'mine' },
      { kind: 'move', to: 'pine-ridge' },
      { kind: 'act', action: 'chop' },
    ]

    const end = runToEnd(startExpedition(ctx, { plan, departAt: sunrise }), ctx)

    expect(end.status).toBe('finished')
    expect(end.outcome).toBe('on-time')
    expect(end.zoneId).toBe('landing')
    expect(end.pending).toHaveLength(0)
    expect(kinds(end.log)).toContain('return-start')
    expect(kinds(end.log)).not.toContain('auto-return')
    expect(end.now).toBeLessThanOrEqual(world.cycle.sunset)
  })

  it('reports where it is mid-step without finishing early', () => {
    const ctx = context()
    const state = advanceTo(
      startExpedition(ctx, { plan: [{ kind: 'move', to: 'salt-flats' }], departAt: sunrise }),
      sunrise + 5,
      ctx,
    )

    expect(state.now).toBe(sunrise + 5)
    expect(state.status).toBe('travelling')
    expect(state.activity?.to).toBe('salt-flats')
    expect(state.outcome).toBeNull()
  })

  it('is deterministic for a given seed and diverges for another', () => {
    const plan: PlanStep[] = [{ kind: 'move', to: 'iron-vein' }, { kind: 'act', action: 'mine' }]
    const run = (seed: number) => {
      const ctx = context({ rng: createRng(seed) })
      return runToEnd(startExpedition(ctx, { plan, departAt: sunrise }), ctx).now
    }

    expect(run(1)).toBe(run(1))
    expect(run(1)).not.toBe(run(999))
  })
})

describe('automatic return', () => {
  it('drops the rest of the plan once the time left stops being enough', () => {
    const ctx = context()
    const plan: PlanStep[] = [
      { kind: 'move', to: 'iron-vein' },
      ...Array.from({ length: 20 }, () => ({ kind: 'act', action: 'mine' }) as PlanStep),
    ]

    const end = runToEnd(startExpedition(ctx, { plan, departAt: sunrise }), ctx)

    expect(end.autoReturn).toBe(true)
    expect(end.status).toBe('finished')
    expect(end.zoneId).toBe('landing')
    expect(end.outcome).toBe('on-time')

    const auto = end.log.find((entry) => entry.kind === 'auto-return')
    expect(auto).toBeDefined()
    expect(auto?.at).toBeLessThan(world.cycle.sunset)
    expect(end.log.filter((entry) => entry.kind === 'action-done').length).toBeGreaterThan(0)
  })

  it('never lets a step start that would strand the explorer', () => {
    const ctx = context({ rng: fixedRng(0.999) })
    const plan: PlanStep[] = [
      { kind: 'move', to: 'salt-flats' },
      ...Array.from({ length: 30 }, () => ({ kind: 'act', action: 'forage' }) as PlanStep),
    ]

    const end = runToEnd(startExpedition(ctx, { plan, departAt: sunrise }), ctx)

    expect(end.outcome).toBe('on-time')
    expect(end.now).toBeLessThanOrEqual(world.cycle.sunset)
  })

  it('turns back immediately when asked, mid-plan', () => {
    const ctx = context()
    const plan: PlanStep[] = [
      { kind: 'move', to: 'old-camp' },
      { kind: 'act', action: 'build-cache' },
      { kind: 'act', action: 'explore' },
    ]

    let state = advanceTo(startExpedition(ctx, { plan, departAt: sunrise }), 7 * 60, ctx)
    expect(state.status).toBe('acting')

    state = runToEnd(abortToReturn(state, ctx), ctx)

    expect(state.status).toBe('finished')
    expect(state.outcome).toBe('on-time')
    expect(kinds(state.log)).not.toContain('action-start-explore')
    expect(state.log.filter((e) => e.kind === 'action-done')).toHaveLength(0)
  })
})

describe('late departures', () => {
  it('takes the rescue shuttle when it gets back after sunset', () => {
    const ctx = context()
    const state = startExpedition(ctx, {
      plan: [],
      departAt: world.cycle.sunset + 30,
      from: 'salt-flats',
    })

    const end = runToEnd(state, ctx)

    expect(end.outcome).toBe('rescued')
    expect(end.now).toBeGreaterThan(world.cycle.sunset)
    expect(end.now).toBeLessThanOrEqual(world.cycle.deadline)
  })

  it('is stranded past the deadline', () => {
    const ctx = context()
    const state = startExpedition(ctx, {
      plan: [],
      departAt: world.cycle.deadline + 5,
      from: 'salt-flats',
    })

    expect(runToEnd(state, ctx).outcome).toBe('stranded')
  })
})

describe('replanning in the field', () => {
  it('swaps the remaining steps and keeps the current one running', () => {
    const ctx = context()
    const state = advanceTo(
      startExpedition(ctx, {
        plan: [{ kind: 'move', to: 'iron-vein' }, { kind: 'act', action: 'mine' }],
        departAt: sunrise,
      }),
      sunrise + 5,
      ctx,
    )

    const activityBefore = state.activity
    const changed = replan(state, [{ kind: 'act', action: 'prospect' }], ctx)

    expect(changed.activity).toEqual(activityBefore)
    expect(changed.pending).toEqual([{ kind: 'act', action: 'prospect' }])

    const end = runToEnd(changed, ctx)
    const done = end.log.filter((entry) => entry.kind === 'action-done')
    expect(done.map((entry) => entry.actionId)).toEqual(['prospect'])
  })

  it('trims a new plan that no longer fits', () => {
    const ctx = context()
    const state = advanceTo(
      startExpedition(ctx, { plan: [{ kind: 'move', to: 'iron-vein' }], departAt: 15 * 60 }),
      15 * 60 + 5,
      ctx,
    )

    const changed = replan(
      state,
      Array.from({ length: 10 }, () => ({ kind: 'act', action: 'mine' }) as PlanStep),
      ctx,
    )

    expect(changed.pending.length).toBeLessThan(10)
    expect(runToEnd(changed, ctx).outcome).toBe('on-time')
  })

  it('skips a step whose action the zone does not offer', () => {
    const ctx = context()
    const end = runToEnd(
      startExpedition(ctx, { plan: [{ kind: 'act', action: 'mine' }], departAt: sunrise }),
      ctx,
    )

    expect(kinds(end.log)).toContain('step-skipped')
    expect(end.outcome).toBe('on-time')
  })
})

describe('random events', () => {
  it('unlocks an opportunity that a replan can then use', () => {
    const table: EventTable = {
      chancePerStep: 1,
      events: [{ id: 'seam', label: 'Filon', weight: 1, effect: { type: 'unlock', action: 'rich-seam' } }],
    }
    const ctx = context({ events: table })

    const state = advanceTo(
      startExpedition(ctx, { plan: [{ kind: 'move', to: 'iron-vein' }], departAt: sunrise }),
      sunrise + 30,
      ctx,
    )

    expect(state.unlocked.get('iron-vein')?.has('rich-seam')).toBe(true)

    // The explorer is already walking home, so cashing in the seam costs the
    // walk back — and only happens if the day still has room for it.
    const changed = replan(
      state,
      [{ kind: 'move', to: 'iron-vein' }, { kind: 'act', action: 'rich-seam' }],
      ctx,
    )
    expect(changed.pending).toHaveLength(2)

    const end = runToEnd(changed, ctx)
    expect(end.log.some((e) => e.kind === 'action-done' && e.actionId === 'rich-seam')).toBe(true)
  })

  it('slows the explorer down for the rest of the day', () => {
    const table: EventTable = {
      chancePerStep: 1,
      events: [{ id: 'storm', label: 'Bourrasque', weight: 1, effect: { type: 'pace', multiplier: 0.5 } }],
    }
    const ctx = context({ events: table })

    const state = advanceTo(
      startExpedition(ctx, { plan: [{ kind: 'move', to: 'iron-vein' }], departAt: sunrise }),
      sunrise + 30,
      ctx,
    )

    expect(state.paceModifier).toBeLessThan(1)
    expect(projectedSchedule(state, ctx).returnLeg.estimate.expected).toBeGreaterThan(
      projectedSchedule({ ...state, paceModifier: 1 }, ctx).returnLeg.estimate.expected,
    )
  })

  it('charges a delay to the next step', () => {
    const table: EventTable = {
      chancePerStep: 1,
      events: [{ id: 'sprain', label: 'Entorse', weight: 1, effect: { type: 'delay', minutes: 45 } }],
    }
    const plan: PlanStep[] = [{ kind: 'move', to: 'iron-vein' }, { kind: 'act', action: 'mine' }]

    const plain = runToEnd(startExpedition(context(), { plan, departAt: sunrise }), context())
    const ctx = context({ events: table })
    const delayed = runToEnd(startExpedition(ctx, { plan, departAt: sunrise }), ctx)

    expect(delayed.now).toBeGreaterThan(plain.now)
    expect(delayed.outcome).toBe('on-time')
  })

  it('leaves the run untouched when no table is supplied', () => {
    const ctx = context()
    const end = runToEnd(
      startExpedition(ctx, { plan: [{ kind: 'move', to: 'iron-vein' }], departAt: sunrise }),
      ctx,
    )

    expect(kinds(end.log)).not.toContain('event')
    expect(end.paceModifier).toBe(1)
  })

  it('survives a full day with the demo table on many seeds', () => {
    const plan: PlanStep[] = [
      { kind: 'move', to: 'iron-vein' },
      { kind: 'act', action: 'mine' },
      { kind: 'move', to: 'salt-flats' },
      { kind: 'act', action: 'forage' },
      { kind: 'move', to: 'old-camp' },
      { kind: 'act', action: 'build-cache' },
    ]

    for (let seed = 0; seed < 100; seed++) {
      const ctx = context({ rng: createRng(seed), events: DEMO_EVENTS })
      const end = runToEnd(startExpedition(ctx, { plan, departAt: sunrise }), ctx)

      expect(end.status).toBe('finished')
      expect(end.zoneId).toBe('landing')
      expect(end.outcome).not.toBe('stranded')
    }
  })
})

describe('slackRemaining', () => {
  it('shrinks as the day goes and turns negative once the return is due', () => {
    const ctx = context()
    const start = startExpedition(ctx, { plan: [{ kind: 'move', to: 'salt-flats' }], departAt: sunrise })
    const morning = slackRemaining(start, ctx)
    const evening = slackRemaining({ ...start, now: 18 * 60, activity: null, zoneId: 'salt-flats' }, ctx)

    expect(morning).toBeGreaterThan(0)
    expect(evening).toBeLessThan(morning)
  })
})
