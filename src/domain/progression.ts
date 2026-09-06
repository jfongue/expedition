import type { ZoneKind } from './continent'
import { createExplorer, type Explorer } from './types'

/**
 * The macro loop's rules: what loot can be invested in, and what each upgrade
 * actually changes about a day on the continent. Every entry here has a
 * mechanical effect wired into `explorerFrom`, `terrainReliefFrom` or
 * `sunriseShiftFrom` — nothing is decoration.
 */

export type UpgradeCategory = 'camp' | 'capacity' | 'knowledge'

export interface UpgradeDef {
  code: string
  name: string
  category: UpgradeCategory
  description: string
  /** Player-facing summary of the mechanical effect, per level. */
  effect: string
  maxLevel: number
  baseCost: number
}

export const UPGRADES: readonly UpgradeDef[] = [
  {
    code: 'room', name: 'Chambre', category: 'camp',
    description: 'Une vraie chambre au campement : on se lève avant le jour.',
    effect: 'Lever du soleil −12 min par niveau (journée plus longue)', maxLevel: 5, baseCost: 150,
  },
  {
    code: 'comfort', name: 'Confort', category: 'camp',
    description: 'Confort du campement : on part le moral haut.',
    effect: 'Allure +2 % par niveau', maxLevel: 5, baseCost: 120,
  },
  {
    code: 'workbench', name: 'Établi', category: 'camp',
    description: 'Réparer et fabriquer soi-même entre deux expéditions.',
    effect: 'Coût des améliorations −8 % par niveau', maxLevel: 3, baseCost: 300,
  },
  {
    code: 'endurance', name: 'Endurance', category: 'capacity',
    description: 'Marcher plus longtemps sans faiblir.',
    effect: 'Allure +6 % par niveau', maxLevel: 5, baseCost: 100,
  },
  {
    code: 'sturdiness', name: 'Robustesse', category: 'capacity',
    description: 'Encaisser les mauvaises rencontres.',
    effect: 'Contrecoups des événements −20 % par niveau', maxLevel: 5, baseCost: 100,
  },
  {
    code: 'swimming', name: 'Natation', category: 'capacity',
    description: 'Traverser rivières, marais et bras de mer.',
    effect: 'Marais et côtes −10 % de difficulté par niveau', maxLevel: 3, baseCost: 200,
  },
  {
    code: 'climbing', name: 'Escalade', category: 'capacity',
    description: 'Franchir les reliefs au lieu de les contourner.',
    effect: 'Montagnes et grottes −9 % de difficulté par niveau', maxLevel: 3, baseCost: 200,
  },
  {
    code: 'mining', name: 'Minage', category: 'capacity',
    description: 'Extraire plus vite et atteindre les filons profonds.',
    effect: 'Minage +10 % de vitesse et +12 % de butin par niveau', maxLevel: 5, baseCost: 150,
  },
  {
    code: 'languages', name: 'Langues', category: 'knowledge',
    description: 'Lire les inscriptions et comprendre les indices.',
    effect: 'Fouille +10 % de vitesse et +12 % de butin par niveau', maxLevel: 3, baseCost: 250,
  },
  {
    code: 'shortcuts', name: 'Raccourcis', category: 'knowledge',
    description: 'Connaître les chemins courts et les repères.',
    effect: 'Estimations de temps plus fiables (+1 niveau de lecture)', maxLevel: 5, baseCost: 180,
  },
  {
    code: 'crafts', name: 'Métiers', category: 'knowledge',
    description: "Reconnaître et valoriser ce que l'on ramène.",
    effect: 'Construction plus rapide et butin mieux valorisé (+4 % par niveau)', maxLevel: 3, baseCost: 220,
  },
]

export const UPGRADE_BY_CODE: Readonly<Record<string, UpgradeDef>> = Object.fromEntries(
  UPGRADES.map((upgrade) => [upgrade.code, upgrade]),
)

export type UpgradeLevels = Readonly<Record<string, number>>

/** Cost of buying the *next* level. Rises with the level, falls with the workbench. */
export function upgradeCost(code: string, levels: UpgradeLevels): number | null {
  const def = UPGRADE_BY_CODE[code]
  if (!def) return null

  const current = levels[code] ?? 0
  if (current >= def.maxLevel) return null

  const discount = 1 - Math.min(0.24, (levels.workbench ?? 0) * 0.08)
  return Math.round(def.baseCost * (1 + current * 0.6) * discount)
}

const XP_PER_LEVEL = 60

/** Level 2 at 60 xp, 3 at 240, 4 at 540 — steepening, so late levels earn. */
export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(1 + Math.sqrt(Math.max(0, xp) / XP_PER_LEVEL)))
}

export function xpForLevel(level: number): number {
  return Math.round(Math.pow(Math.max(1, level) - 1, 2) * XP_PER_LEVEL)
}

/** Progress towards the next level, as 0..1. */
export function levelProgress(xp: number): number {
  const level = levelFromXp(xp)
  const floor = xpForLevel(level)
  const ceiling = xpForLevel(level + 1)
  return ceiling === floor ? 1 : (xp - floor) / (ceiling - floor)
}

export interface Progress {
  playerId: string
  xp: number
  credits: number
  upgrades: UpgradeLevels
  /** Set after a day spent at camp: sharper and quicker for one expedition. */
  rested: boolean
}

export function emptyProgress(playerId: string): Progress {
  return { playerId, xp: 0, credits: 0, upgrades: {}, rested: false }
}

/**
 * The explorer sheet the simulation runs with. `level` is deliberately not just
 * the player's level: it is how well they *read* the ground, so knowledge of
 * shortcuts and a night of rest count towards it.
 */
export function explorerFrom(progress: Progress): Explorer {
  const { upgrades } = progress
  const pace =
    1 +
    (upgrades.endurance ?? 0) * 0.06 +
    (upgrades.comfort ?? 0) * 0.02 +
    (progress.rested ? 0.1 : 0)

  return createExplorer({
    id: progress.playerId,
    level: levelFromXp(progress.xp) + (upgrades.shortcuts ?? 0) + (progress.rested ? 1 : 0),
    pace,
    skills: {
      mining: upgrades.mining ?? 0,
      languages: upgrades.languages ?? 0,
      crafts: upgrades.crafts ?? 0,
      shortcuts: upgrades.shortcuts ?? 0,
      endurance: upgrades.endurance ?? 0,
    },
  })
}

/** Difficulty multipliers per terrain, from the movement capacities. */
export function terrainReliefFrom(upgrades: UpgradeLevels): Partial<Record<ZoneKind, number>> {
  const swim = 1 - Math.min(0.3, (upgrades.swimming ?? 0) * 0.1)
  const climb = 1 - Math.min(0.27, (upgrades.climbing ?? 0) * 0.09)

  return { swamp: swim, coast: swim, mountain: climb, cave: climb }
}

export function sunriseShiftFrom(upgrades: UpgradeLevels): number {
  const shift = Math.min(60, (upgrades.room ?? 0) * 12)
  return shift === 0 ? 0 : -shift
}

/** How much of an event's malus the explorer shrugs off. */
export function eventResistance(upgrades: UpgradeLevels): number {
  return Math.min(0.8, (upgrades.sturdiness ?? 0) * 0.2)
}

/** Loot is worth more once you know what you are carrying. */
export function valueMultiplier(upgrades: UpgradeLevels): number {
  return 1 + (upgrades.crafts ?? 0) * 0.04
}
