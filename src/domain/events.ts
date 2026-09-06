import { pickWeighted, type Rng } from './rng'
import type { DayPhase, Minutes } from './time'
import type { ActionId, ZoneId } from './types'

/**
 * What a random encounter does to the rest of the day. Events never rewrite
 * the plan themselves — they change the constraints, and the planner (or the
 * auto-return) reacts.
 */
export type EventEffect =
  /** Eats into the day: the next step starts late. */
  | { type: 'delay'; minutes: Minutes }
  /** A seam, a ruin, an opportunity: a new action in the current zone. */
  | { type: 'unlock'; action: ActionId; zone?: ZoneId }
  /** Bad weather, an injury: everything takes longer from now on. */
  | { type: 'pace'; multiplier: number }
  /** Flavour only — a sighting, a rumour. */
  | { type: 'notice' }

export interface RandomEventDef {
  id: string
  label: string
  weight: number
  /** Restrict to these terrain kinds. Omitted = anywhere. */
  zoneKinds?: readonly string[]
  /** Restrict to these parts of the day. Omitted = any time. */
  phases?: readonly DayPhase[]
  effect: EventEffect
}

export interface EventTable {
  /** Probability that anything fires at all, rolled once per completed step. */
  chancePerStep: number
  events: readonly RandomEventDef[]
}

export const EMPTY_EVENT_TABLE: EventTable = { chancePerStep: 0, events: [] }

export interface EventContext {
  zoneId: ZoneId
  zoneKind: string
  phase: DayPhase
}

/** Rolls for an event. Consumes one or two draws from `rng`, always. */
export function drawEvent(table: EventTable, rng: Rng, context: EventContext): RandomEventDef | null {
  const fires = rng.next() < table.chancePerStep
  const candidates = table.events.filter((event) => matches(event, context))
  const picked = pickWeighted(rng, candidates, (event) => event.weight)

  return fires ? picked : null
}

function matches(event: RandomEventDef, context: EventContext): boolean {
  if (event.zoneKinds && !event.zoneKinds.includes(context.zoneKind)) return false
  if (event.phases && !event.phases.includes(context.phase)) return false
  return true
}
