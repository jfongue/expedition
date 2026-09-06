import { createRng, randomBetween, type Rng } from './rng'
import type { LogEntry } from './expedition'
import type { ActionId, Explorer, SkillId } from './types'

/** What the explorer carries: item code -> quantity. */
export type LootBag = Readonly<Record<string, number>>

export interface LootRules {
  /** Base quantities per action. Fractional entries are drop *chances*. */
  yields: Readonly<Record<ActionId, Readonly<Record<string, number>>>>
  xp: Readonly<Record<ActionId, number>>
  /** Skill that improves each action's yield — the same one that speeds it up. */
  skills: Readonly<Record<ActionId, SkillId | undefined>>
}

export function lootRulesFrom(
  actions: readonly { id: ActionId; skill?: SkillId; yields?: Readonly<Record<string, number>>; xp: number }[],
): LootRules {
  return {
    yields: Object.fromEntries(actions.map((a) => [a.id, a.yields ?? {}])),
    xp: Object.fromEntries(actions.map((a) => [a.id, a.xp])),
    skills: Object.fromEntries(actions.map((a) => [a.id, a.skill])),
  }
}

const SKILL_BONUS_PER_LEVEL = 0.12
const SPREAD_LOW = 0.6
const SPREAD_HIGH = 1.45

/**
 * What one completed action actually produced. Quantities are scaled by the
 * matching skill and a roll, then split into a whole part and a chance on the
 * remainder — which is how a `0.25` relic yield becomes a one-in-four find.
 */
export function resolveActionLoot(
  rules: LootRules,
  explorer: Explorer,
  actionId: ActionId,
  rng: Rng,
): LootBag {
  const table = rules.yields[actionId]
  if (!table) return {}

  const bonus = 1 + Math.max(0, skillLevelFor(rules, explorer, actionId)) * SKILL_BONUS_PER_LEVEL
  const bag: Record<string, number> = {}

  // Sorted so the draw order — and therefore the result — is stable.
  for (const code of Object.keys(table).sort()) {
    const raw = table[code] * bonus * randomBetween(rng, SPREAD_LOW, SPREAD_HIGH)
    const whole = Math.floor(raw)
    const quantity = whole + (rng.next() < raw - whole ? 1 : 0)
    if (quantity > 0) bag[code] = quantity
  }

  return bag
}

export function mergeBags(...bags: readonly LootBag[]): LootBag {
  const total: Record<string, number> = {}
  for (const bag of bags) {
    for (const [code, quantity] of Object.entries(bag)) {
      total[code] = (total[code] ?? 0) + quantity
    }
  }
  return total
}

export function bagValue(bag: LootBag, values: Readonly<Record<string, number>>): number {
  return Object.entries(bag).reduce((sum, [code, quantity]) => sum + (values[code] ?? 0) * quantity, 0)
}

export function bagSize(bag: LootBag): number {
  return Object.values(bag).reduce((sum, quantity) => sum + quantity, 0)
}

export interface RunHaul {
  loot: LootBag
  xp: number
}

/**
 * The haul so far, derived from the run log rather than tracked in the
 * simulation state. The RNG is re-seeded from `seed` on every call, so calling
 * this repeatedly as the log grows keeps returning the same numbers for the
 * actions already completed — which is what lets the UI show a live tally.
 */
export function haulFromLog(
  log: readonly LogEntry[],
  rules: LootRules,
  explorer: Explorer,
  seed: number,
): RunHaul {
  const rng = createRng(seed)
  const bags: LootBag[] = []
  let xp = 0

  for (const entry of log) {
    if (entry.kind !== 'action-done') continue
    bags.push(resolveActionLoot(rules, explorer, entry.actionId, rng))
    xp += rules.xp[entry.actionId] ?? 0
  }

  return { loot: mergeBags(...bags), xp }
}

/** Skill level backing an action, looked up through the explorer's sheet. */
function skillLevelFor(rules: LootRules, explorer: Explorer, actionId: ActionId): number {
  const skill = rules.skills[actionId]
  return skill ? (explorer.skills[skill] ?? 0) : 0
}
