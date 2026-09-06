import type { ExpeditionOutcome } from './expedition'
import { bagValue, type LootBag } from './loot'

/**
 * The end of the macro loop: the shuttle ride is paid for, the base takes its
 * cut, and what is left becomes credits to invest at camp.
 */
export interface Settlement {
  outcome: ExpeditionOutcome
  /** What actually comes home. Empty if the explorer was stranded. */
  lootKept: LootBag
  /** Market value of the haul, before anything is taken off it. */
  gross: number
  /** The base's cut, at the mission's rate. */
  tax: number
  /** Charged only when the rescue shuttle had to come back after sunset. */
  rescueFee: number
  /** Mission objective bonus, if it was met. */
  bonus: number
  /** Credits added to the player's purse. Never negative. */
  net: number
  xp: number
}

export interface SettleInput {
  loot: LootBag
  xp: number
  outcome: ExpeditionOutcome
  /** Percent of gross owed to the base. */
  taxRate: number
  values: Readonly<Record<string, number>>
  /** Multiplies the market value of the haul (the Métiers upgrade). */
  valueMultiplier?: number
  objectiveMet?: boolean
  objectiveBonus?: number
}

const RESCUE_SHARE = 0.4
const RESCUE_MINIMUM = 60
/** Being stranded is survivable, but the day's haul is gone. */
const STRANDED_XP_SHARE = 0.25

export function settle(input: SettleInput): Settlement {
  const {
    loot, xp, outcome, taxRate, values,
    valueMultiplier = 1, objectiveMet = false, objectiveBonus = 0,
  } = input

  if (outcome === 'stranded') {
    return {
      outcome, lootKept: {}, gross: 0, tax: 0, rescueFee: 0, bonus: 0,
      net: 0, xp: Math.round(xp * STRANDED_XP_SHARE),
    }
  }

  const gross = Math.round(bagValue(loot, values) * valueMultiplier)
  const tax = Math.round((gross * clampRate(taxRate)) / 100)
  const rescueFee = outcome === 'rescued' ? Math.max(RESCUE_MINIMUM, Math.round(gross * RESCUE_SHARE)) : 0
  const bonus = objectiveMet ? objectiveBonus : 0

  return {
    outcome,
    lootKept: loot,
    gross,
    tax,
    rescueFee,
    bonus,
    net: Math.max(0, gross - tax - rescueFee + bonus),
    xp,
  }
}

function clampRate(rate: number): number {
  return Math.min(100, Math.max(0, rate))
}
