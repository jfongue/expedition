import type { DayCycle, Minutes } from './time'

export type ZoneId = string
export type ActionId = string
export type SkillId = string

export interface Zone {
  id: ZoneId
  name: string
  /** Free-form terrain tag ('forest', 'mine', 'ruins'…). The domain only
   *  uses it to match actions; the renderer uses it for art. */
  kind: string
  /** Map coordinates. Any unit — `World.paceUnitsPerMinute` gives them meaning. */
  x: number
  y: number
  /** Multiplies the time needed to travel *into* this zone. 1 = open ground. */
  difficulty: number
  /** Actions the zone offers by default. Events can unlock more. */
  actions: readonly ActionId[]
}

export interface ActionDef {
  id: ActionId
  name: string
  /** Baseline duration for a level-1 explorer with no relevant skill. */
  duration: Minutes
  /** Skill that speeds this action up, if any. */
  skill?: SkillId
  /** Purely descriptive for the domain — the loot rules live elsewhere. */
  yields?: Readonly<Record<string, number>>
}

export interface Explorer {
  id: string
  /** Drives estimate reliability: a veteran reads the terrain better. */
  level: number
  /** Movement multiplier. 1 = baseline, 1.2 = 20% faster. */
  pace: number
  skills: Readonly<Record<SkillId, number>>
}

export function createExplorer(init: Partial<Explorer> & { id: string }): Explorer {
  return { level: 1, pace: 1, skills: {}, ...init }
}

export interface WorldInit {
  zones: readonly Zone[]
  actions: readonly ActionDef[]
  /** The drop point. Every plan ends here — that is the whole tension. */
  landingZoneId: ZoneId
  cycle: DayCycle
  /** Map units covered per minute at pace 1 on difficulty-1 ground. */
  paceUnitsPerMinute: number
  /** Refuse to start a step unless the worst-case return still fits with
   *  this much room to spare. */
  safetyMargin: Minutes
}

export interface World extends WorldInit {
  zone(id: ZoneId): Zone
  action(id: ActionId): ActionDef
  hasZone(id: ZoneId): boolean
  hasAction(id: ActionId): boolean
}

export function createWorld(init: WorldInit): World {
  const zones = new Map(init.zones.map((zone) => [zone.id, zone]))
  const actions = new Map(init.actions.map((action) => [action.id, action]))

  if (zones.size !== init.zones.length) throw new Error('createWorld: duplicate zone id')
  if (actions.size !== init.actions.length) throw new Error('createWorld: duplicate action id')
  if (!zones.has(init.landingZoneId)) {
    throw new Error(`createWorld: unknown landing zone "${init.landingZoneId}"`)
  }

  for (const zone of init.zones) {
    for (const actionId of zone.actions) {
      if (!actions.has(actionId)) {
        throw new Error(`createWorld: zone "${zone.id}" offers unknown action "${actionId}"`)
      }
    }
  }

  return {
    ...init,
    hasZone: (id) => zones.has(id),
    hasAction: (id) => actions.has(id),
    zone(id) {
      const found = zones.get(id)
      if (!found) throw new Error(`Unknown zone "${id}"`)
      return found
    },
    action(id) {
      const found = actions.get(id)
      if (!found) throw new Error(`Unknown action "${id}"`)
      return found
    },
  }
}
