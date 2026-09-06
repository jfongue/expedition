import { buildWorld, CONTINENT, CONTINENT_ACTIONS, CONTINENT_EVENTS, ITEM_VALUES, type WorldShape } from './continent'
import type { ExpeditionContext, ExpeditionState } from './expedition'
import { haulFromLog, lootRulesFrom, type LootRules, type RunHaul } from './loot'
import { objectiveMet, type Mission } from './missions'
import { explorerFrom, sunriseShiftFrom, terrainReliefFrom, valueMultiplier, type Progress } from './progression'
import { createRng } from './rng'
import { settle, type Settlement } from './settle'
import type { Minutes } from './time'
import type { Explorer, World } from './types'

/**
 * One day on the continent, assembled. This is the seam the UI talks to: give
 * it the mission and the player's progress, and it hands back everything the
 * simulation needs — world, explorer sheet, seeded RNG, loot rules — plus the
 * two functions that turn a run state into a haul and a settlement.
 */
export interface RunSession {
  mission: Mission
  world: World
  explorer: Explorer
  ctx: ExpeditionContext
  rules: LootRules
  /** Seeds both the simulation and the loot, so a day replays identically. */
  seed: number
  departAt: Minutes
  day: number
}

export interface RunSetup {
  mission: Mission
  progress: Progress
  day: number
  /** Departure can be pushed back past sunrise, at the cost of margin. */
  departAt?: Minutes
  shape?: WorldShape
  /** Override the seed to replay a specific day. */
  seed?: number
}

export function createRunSession(setup: RunSetup): RunSession {
  const { mission, progress, day, shape = CONTINENT } = setup

  const world = buildWorld({
    landingZoneId: mission.baseZoneId,
    terrainRelief: terrainReliefFrom(progress.upgrades),
    sunriseShift: sunriseShiftFrom(progress.upgrades),
    shape,
  })

  const explorer = explorerFrom(progress)
  const seed = setup.seed ?? seedFor(day, progress.playerId, mission.id)

  return {
    mission,
    world,
    explorer,
    rules: lootRulesFrom(shape.actions ?? CONTINENT_ACTIONS),
    seed,
    day,
    departAt: Math.max(world.cycle.sunrise, setup.departAt ?? world.cycle.sunrise),
    ctx: { world, explorer, rng: createRng(seed), events: CONTINENT_EVENTS },
  }
}

/** The haul as it stands, recomputed from the log — see `haulFromLog`. */
export function haulOf(state: ExpeditionState, session: RunSession): RunHaul {
  return haulFromLog(state.log, session.rules, session.explorer, session.seed)
}

export function settleRun(
  state: ExpeditionState,
  session: RunSession,
  progress: Progress,
  values: Readonly<Record<string, number>> = ITEM_VALUES,
): Settlement {
  const haul = haulOf(state, session)

  return settle({
    loot: haul.loot,
    xp: haul.xp,
    outcome: state.outcome ?? 'stranded',
    taxRate: session.mission.taxRate,
    values,
    valueMultiplier: valueMultiplier(progress.upgrades),
    objectiveMet: objectiveMet(session.mission, state.log),
    objectiveBonus: session.mission.bonusCredits,
  })
}

/**
 * A fresh context with the RNG rewound. `advanceTo` consumes draws as it goes,
 * so a session cannot be replayed without one.
 */
export function rewind(session: RunSession): RunSession {
  return { ...session, ctx: { ...session.ctx, rng: createRng(session.seed) } }
}

function seedFor(day: number, playerId: string, missionId: string): number {
  let hash = day * 2654435761
  for (const char of `${playerId}:${missionId}`) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return hash >>> 0
}
