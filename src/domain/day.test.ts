import { describe, expect, it } from 'vitest'
import { CONTINENT_ZONES } from './continent'
import { advanceTo, startExpedition } from './expedition'
import { generateMissions } from './missions'
import { emptyProgress, type Progress } from './progression'
import { schedulePlan, type PlanStep } from './plan'
import { createRunSession, haulOf, settleRun } from './run'
import { travelMinutes } from './cost'
import { MINUTES_PER_DAY } from './time'

const missions = generateMissions(1)
const nord = missions.find((mission) => mission.baseZoneId === 'base-nord')!

function sessionFor(progress: Progress = emptyProgress('p1')) {
  return createRunSession({ mission: nord, progress, day: 1 })
}

describe('the continent is playable', () => {
  it('puts every zone within reach of its own elevator', () => {
    const session = sessionFor()
    const { world, explorer } = session

    for (const zone of CONTINENT_ZONES.filter((z) => z.region === 'nord' && z.kind !== 'base')) {
      const there = travelMinutes(world, explorer, 'base-nord', zone.code)

      // Long enough that the choice costs something, short enough to allow a
      // few legs plus actions inside one day.
      expect(there).toBeGreaterThan(40)
      expect(there).toBeLessThan(180)
    }
  })

  it('leaves no room for a full day in another region', () => {
    const { world, explorer } = sessionFor()
    const across = travelMinutes(world, explorer, 'base-nord', 'salants')

    expect(across).toBeGreaterThan(150)
  })
})

describe('a planned day', () => {
  const plan: PlanStep[] = [
    { kind: 'move', to: nord.objective.zoneId },
    { kind: 'act', action: nord.objective.actionId },
    { kind: 'act', action: 'forage' },
  ]

  it('fits, and ends back at the elevator before sunset', () => {
    const session = sessionFor()
    const schedule = schedulePlan(session.world, session.explorer, plan, { departAt: session.departAt })

    expect(schedule.problems).toEqual([])
    expect(schedule.fits).toBe(true)
    expect(schedule.returnLeg.to).toBe('base-nord')
    expect(schedule.worstCaseArrivalAt).toBeLessThanOrEqual(session.world.cycle.sunset)
  })

  it('runs to a settled, paid-out day', () => {
    const progress = emptyProgress('p1')
    const session = sessionFor(progress)

    const state = advanceTo(
      startExpedition(session.ctx, { plan, departAt: session.departAt }),
      MINUTES_PER_DAY,
      session.ctx,
    )

    expect(state.status).toBe('finished')
    expect(state.outcome).toBe('on-time')
    expect(state.zoneId).toBe('base-nord')

    const haul = haulOf(state, session)
    const settlement = settleRun(state, session, progress)

    expect(haul.xp).toBeGreaterThan(0)
    expect(settlement.gross).toBeGreaterThan(0)
    expect(settlement.net).toBe(settlement.gross - settlement.tax + settlement.bonus)
    // The objective was in the plan, so the bonus is paid.
    expect(settlement.bonus).toBe(nord.bonusCredits)
  })

  it('is reproducible from the same day and player', () => {
    const play = () => {
      const session = sessionFor()
      const state = advanceTo(
        startExpedition(session.ctx, { plan, departAt: session.departAt }),
        MINUTES_PER_DAY,
        session.ctx,
      )
      return { log: state.log, haul: haulOf(state, session) }
    }

    expect(play()).toEqual(play())
  })
})

describe('an over-ambitious day', () => {
  // Every zone of the region, then a hop to another region: far too much.
  const greedy: PlanStep[] = [
    { kind: 'move', to: 'crete-fer' },
    { kind: 'act', action: 'mine' },
    { kind: 'move', to: 'bois-nord' },
    { kind: 'act', action: 'hunt' },
    { kind: 'move', to: 'terrasses' },
    { kind: 'act', action: 'explore' },
    { kind: 'move', to: 'salants' },
    { kind: 'act', action: 'forage' },
  ]

  it('is refused by the planner', () => {
    const session = sessionFor()
    const schedule = schedulePlan(session.world, session.explorer, greedy, { departAt: session.departAt })

    expect(schedule.fits).toBe(false)
    expect(schedule.problems).toContainEqual(expect.objectContaining({ kind: 'no-time' }))
  })

  it('still gets the explorer home, by cutting the plan short', () => {
    const session = sessionFor()
    const state = advanceTo(
      startExpedition(session.ctx, { plan: greedy, departAt: session.departAt }),
      MINUTES_PER_DAY,
      session.ctx,
    )

    expect(state.autoReturn).toBe(true)
    expect(state.outcome).toBe('on-time')
    expect(state.log).toContainEqual(expect.objectContaining({ kind: 'auto-return' }))
  })
})

describe('progression pays off', () => {
  const plan: PlanStep[] = [
    { kind: 'move', to: 'crete-fer' },
    { kind: 'act', action: 'mine' },
  ]

  it('lets a veteran do the same day with more slack', () => {
    const rookie = sessionFor()
    const veteran = sessionFor({
      playerId: 'p1', xp: 900, credits: 0, rested: true,
      upgrades: { endurance: 5, climbing: 3, room: 5, mining: 5, shortcuts: 3 },
    })

    const slackOf = (session: ReturnType<typeof sessionFor>) =>
      schedulePlan(session.world, session.explorer, plan, { departAt: session.departAt }).slack

    expect(slackOf(veteran)).toBeGreaterThan(slackOf(rookie))
    expect(veteran.departAt).toBeLessThan(rookie.departAt)
  })
})
