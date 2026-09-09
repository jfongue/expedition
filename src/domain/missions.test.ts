import { describe, expect, it } from 'vitest'
import { BASE_ZONES, CONTINENT_ZONES, actionsForKind } from './continent'
import { generateMissions, objectiveMet } from './missions'
import type { LogEntry } from './expedition'

describe('generateMissions', () => {
  it('offers one mission per elevator', () => {
    const missions = generateMissions(1)

    expect(missions).toHaveLength(BASE_ZONES.length)
    expect(missions.map((m) => m.baseZoneId).sort()).toEqual(BASE_ZONES.map((z) => z.code).sort())
  })

  it('is stable for a given day and moves on to the next', () => {
    expect(generateMissions(3)).toEqual(generateMissions(3))
    expect(generateMissions(3).map((m) => m.name)).not.toEqual(generateMissions(4).map((m) => m.name))
  })

  it('targets a zone in the elevator’s own region, with an action it offers', () => {
    for (const mission of generateMissions(12)) {
      const target = CONTINENT_ZONES.find((zone) => zone.code === mission.objective.zoneId)!

      expect(target.region).toBe(mission.region)
      expect(target.kind).not.toBe('base')
      expect(actionsForKind(target.kind)).toContain(mission.objective.actionId)
    }
  })

  it('keeps the tax and the bonus in a sane band', () => {
    for (let day = 1; day <= 30; day++) {
      for (const mission of generateMissions(day)) {
        expect(mission.taxRate).toBeGreaterThanOrEqual(8)
        expect(mission.taxRate).toBeLessThanOrEqual(18)
        expect(mission.bonusCredits).toBeGreaterThan(0)
      }
    }
  })
})

describe('the departure the board offers', () => {
  it('follows the sunrise it is given', () => {
    // The Chambre upgrade shifts sunrise earlier; the board has to move with it,
    // or the upgrade buys a longer day the player cannot actually start.
    const early = generateMissions(5, { sunrise: 6 * 60 - 36 })

    for (const mission of early) expect(mission.earliestDepartAt).toBe(6 * 60 - 36)
    for (const mission of generateMissions(5)) expect(mission.earliestDepartAt).toBe(6 * 60)
  })

  it('does not otherwise change the board', () => {
    const strip = (missions: ReturnType<typeof generateMissions>) =>
      missions.map(({ earliestDepartAt: _ignored, ...rest }) => rest)

    expect(strip(generateMissions(5, { sunrise: 300 }))).toEqual(strip(generateMissions(5)))
  })
})

describe('objectiveMet', () => {
  const mission = generateMissions(1)[0]

  it('needs the right action in the right zone', () => {
    const right: LogEntry[] = [
      { at: 500, kind: 'action-done', zoneId: mission.objective.zoneId, actionId: mission.objective.actionId },
    ]
    const wrongZone: LogEntry[] = [
      { at: 500, kind: 'action-done', zoneId: 'base-nord', actionId: mission.objective.actionId },
    ]

    expect(objectiveMet(mission, right)).toBe(true)
    expect(objectiveMet(mission, wrongZone)).toBe(false)
    expect(objectiveMet(mission, [])).toBe(false)
  })

  it('does not count an action that was only started', () => {
    const started: LogEntry[] = [
      { at: 500, kind: 'action-start', zoneId: mission.objective.zoneId, actionId: mission.objective.actionId },
    ]

    expect(objectiveMet(mission, started)).toBe(false)
  })
})
