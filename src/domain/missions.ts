import { CONTINENT_ZONES, actionsForKind, type ContinentZone } from './continent'
import type { LogEntry } from './expedition'
import { createRng, pickWeighted, randomBetween, type Rng } from './rng'
import { DEFAULT_CYCLE, type Minutes } from './time'
import type { ActionId, ZoneId } from './types'

/**
 * A day's offer board. One mission per elevator, regenerated every morning from
 * the day number — so the board is stable while the player deliberates, and
 * identical for every client on the same day.
 */
export interface MissionObjective {
  actionId: ActionId
  zoneId: ZoneId
  label: string
}

export interface Mission {
  id: string
  name: string
  /** The elevator: where the day starts and where it must end. */
  baseZoneId: ZoneId
  region: string
  objective: MissionObjective
  /** Percent of the haul owed to the base on return. */
  taxRate: number
  /** Paid on top if the objective is met. */
  bonusCredits: number
  /** Earliest departure. Later is allowed, with less margin. */
  earliestDepartAt: Minutes
  danger: number
}

const NAMES = ['Relevé', 'Reconnaissance', 'Prélèvement', 'Repérage', 'Inventaire', 'Sondage']

export interface MissionOptions {
  sunrise?: Minutes
  zones?: readonly ContinentZone[]
}

export function generateMissions(day: number, options: MissionOptions = {}): Mission[] {
  const { sunrise = DEFAULT_CYCLE.sunrise, zones = CONTINENT_ZONES } = options
  const rng = createRng(day * 7919 + 13)
  const bases = zones.filter((zone) => zone.kind === 'base')

  return bases.map((base) => {
    const candidates = zones.filter((zone) => zone.region === base.region && zone.kind !== 'base')
    const target = pick(rng, candidates) ?? base
    // Every terrain offers `explore`, so an unweighted pick would make three
    // survey missions out of four. Specialised work is what the board is for.
    const actions = actionsForKind(target.kind).filter((action) => action !== 'rest')
    const actionId = pickWeighted(rng, actions, (action) => (action === 'explore' ? 1 : 4)) ?? 'explore'

    return {
      id: `d${day}-${base.code}`,
      name: `${pick(rng, NAMES)} — ${target.name}`,
      baseZoneId: base.code,
      region: base.region,
      objective: { actionId, zoneId: target.code, label: `${labelFor(actionId)} à ${target.name}` },
      taxRate: Math.round(randomBetween(rng, 8, 18)),
      bonusCredits: Math.round(randomBetween(rng, 60, 180) + target.danger * 20),
      earliestDepartAt: sunrise,
      danger: target.danger,
    }
  })
}

/** Was the mission's objective actually carried out during the run? */
export function objectiveMet(mission: Mission, log: readonly LogEntry[]): boolean {
  return log.some(
    (entry) =>
      entry.kind === 'action-done' &&
      entry.actionId === mission.objective.actionId &&
      entry.zoneId === mission.objective.zoneId,
  )
}

const ACTION_LABELS: Record<string, string> = {
  forage: 'Récolter',
  hunt: 'Chasser',
  mine: 'Miner',
  scavenge: 'Fouiller',
  explore: 'Explorer',
  build: 'Construire une cache',
  rest: 'Se reposer',
  'rich-seam': 'Exploiter un filon',
}

function labelFor(actionId: ActionId): string {
  return ACTION_LABELS[actionId] ?? actionId
}

function pick<T>(rng: Rng, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.min(items.length - 1, Math.floor(rng.next() * items.length))]
}
