import { describe, expect, it } from 'vitest'
import { canAppend, pointOfNoReturn, schedulePlan, timeRemaining, trimToFit, type PlanStep } from './plan'
import { createDemoWorld } from './presets'
import { createExplorer } from './types'

const world = createDemoWorld()
const explorer = createExplorer({ id: 'e1', level: 3, skills: { mining: 2 } })
const departAt = world.cycle.sunrise

describe('schedulePlan', () => {
  it('always appends the return leg, even for an empty plan', () => {
    const schedule = schedulePlan(world, explorer, [], { departAt })

    expect(schedule.steps).toHaveLength(1)
    expect(schedule.returnLeg.step.kind).toBe('return')
    expect(schedule.returnLeg.to).toBe(world.landingZoneId)
    expect(schedule.arrivalAt).toBe(departAt)
    expect(schedule.fits).toBe(true)
  })

  it('chains moves and actions on the clock and brings the explorer home', () => {
    const plan: PlanStep[] = [
      { kind: 'move', to: 'iron-vein' },
      { kind: 'act', action: 'mine' },
      { kind: 'move', to: 'salt-flats' },
      { kind: 'act', action: 'forage' },
    ]
    const schedule = schedulePlan(world, explorer, plan, { departAt })

    expect(schedule.steps.map((s) => s.step.kind)).toEqual(['move', 'act', 'move', 'act', 'return'])
    expect(schedule.steps[0]?.startAt).toBe(departAt)

    for (let i = 1; i < schedule.steps.length; i++) {
      expect(schedule.steps[i]!.startAt).toBe(schedule.steps[i - 1]!.endAt)
    }

    expect(schedule.returnLeg.from).toBe('salt-flats')
    expect(schedule.arrivalAt).toBeLessThan(schedule.worstCaseArrivalAt)
    expect(schedule.fits).toBe(true)
  })

  it('flags an action the current zone does not offer', () => {
    const schedule = schedulePlan(world, explorer, [{ kind: 'act', action: 'mine' }], { departAt })

    expect(schedule.fits).toBe(false)
    expect(schedule.problems).toContainEqual({
      kind: 'action-unavailable',
      index: 0,
      actionId: 'mine',
      zoneId: 'landing',
    })
  })

  it('flags unknown zones and actions without throwing', () => {
    const schedule = schedulePlan(
      world,
      explorer,
      [{ kind: 'move', to: 'atlantis' }, { kind: 'act', action: 'sing' }],
      { departAt },
    )

    expect(schedule.problems).toContainEqual({ kind: 'unknown-zone', index: 0, zoneId: 'atlantis' })
    expect(schedule.problems).toContainEqual({ kind: 'unknown-action', index: 1, actionId: 'sing' })
  })

  it('refuses a plan that cannot make it back before sunset', () => {
    const plan: PlanStep[] = [
      { kind: 'move', to: 'iron-vein' },
      ...Array.from({ length: 12 }, () => ({ kind: 'act', action: 'mine' }) as PlanStep),
    ]
    const schedule = schedulePlan(world, explorer, plan, { departAt })

    expect(schedule.fits).toBe(false)
    expect(schedule.slack).toBeLessThan(world.safetyMargin)
    expect(schedule.problems.some((p) => p.kind === 'no-time')).toBe(true)
  })

  it('leaves less room when the departure is late', () => {
    const plan: PlanStep[] = [{ kind: 'move', to: 'iron-vein' }, { kind: 'act', action: 'mine' }]
    const early = schedulePlan(world, explorer, plan, { departAt })
    const late = schedulePlan(world, explorer, plan, { departAt: 18 * 60 })

    expect(late.slack).toBeLessThan(early.slack)
    expect(early.fits).toBe(true)
    expect(late.fits).toBe(false)
  })
})

describe('time budget helpers', () => {
  it('places the point of no return earlier for a distant zone', () => {
    const near = pointOfNoReturn(world, explorer, 'pine-ridge', 12 * 60)
    const far = pointOfNoReturn(world, explorer, 'salt-flats', 12 * 60)

    expect(far).toBeLessThan(near)
    expect(near).toBeLessThan(world.cycle.sunset)
  })

  it('counts remaining time down to zero at the point of no return', () => {
    const at = pointOfNoReturn(world, explorer, 'iron-vein', 12 * 60)

    expect(timeRemaining(world, explorer, 'iron-vein', 12 * 60)).toBeGreaterThan(0)
    expect(timeRemaining(world, explorer, 'iron-vein', at)).toBeLessThanOrEqual(5)
  })
})

describe('trimToFit', () => {
  it('keeps the longest prefix that still gets home in time', () => {
    const plan: PlanStep[] = [
      { kind: 'move', to: 'iron-vein' },
      { kind: 'act', action: 'mine' },
      { kind: 'act', action: 'mine' },
      { kind: 'act', action: 'mine' },
      { kind: 'act', action: 'mine' },
      { kind: 'act', action: 'mine' },
      { kind: 'act', action: 'mine' },
      { kind: 'act', action: 'mine' },
      { kind: 'act', action: 'mine' },
      { kind: 'act', action: 'mine' },
      { kind: 'act', action: 'mine' },
      { kind: 'act', action: 'mine' },
      { kind: 'act', action: 'mine' },
    ]
    const { steps, schedule } = trimToFit(world, explorer, plan, { departAt })

    expect(schedule.fits).toBe(true)
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.length).toBeLessThan(plan.length)
    expect(canAppend(world, explorer, steps, plan[steps.length]!, { departAt })).toBe(false)
  })
})
