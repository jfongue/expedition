import type { Minutes } from './time'
import type { ActionId, Explorer, World, ZoneId } from './types'

/**
 * True time cost of walking between two zones, before any uncertainty is
 * layered on. Distance is scaled by the difficulty of the terrain being
 * entered and by the explorer's pace.
 */
export function travelMinutes(world: World, explorer: Explorer, from: ZoneId, to: ZoneId): Minutes {
  if (from === to) return 0

  const a = world.zone(from)
  const b = world.zone(to)
  const distance = Math.hypot(b.x - a.x, b.y - a.y)
  const pace = Math.max(0.1, explorer.pace)
  const raw = (distance / world.paceUnitsPerMinute) * b.difficulty / pace

  return Math.max(1, Math.round(raw))
}

/** Each point in the matching skill shaves a bit off the action. */
export function actionMinutes(world: World, explorer: Explorer, actionId: ActionId): Minutes {
  const action = world.action(actionId)
  const skill = action.skill ? (explorer.skills[action.skill] ?? 0) : 0
  const speedup = 1 + Math.max(0, skill) * 0.1

  return Math.max(1, Math.round(action.duration / speedup))
}

/** Whether a zone currently offers an action (events may have unlocked it). */
export function zoneOffers(
  world: World,
  zoneId: ZoneId,
  actionId: ActionId,
  unlocked: ReadonlyMap<ZoneId, ReadonlySet<ActionId>> = new Map(),
): boolean {
  if (world.zone(zoneId).actions.includes(actionId)) return true
  return unlocked.get(zoneId)?.has(actionId) ?? false
}

/** Same explorer, different legs — used to apply temporary event maluses. */
export function withPace(explorer: Explorer, multiplier: number): Explorer {
  if (multiplier === 1) return explorer
  return { ...explorer, pace: Math.max(0.1, explorer.pace * multiplier) }
}
