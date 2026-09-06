import type { EventTable } from './events'
import { DEFAULT_CYCLE } from './time'
import { createWorld, type ActionDef, type World, type Zone } from './types'

/**
 * The continent as data: named zones, the actions each terrain offers, and what
 * those actions yield. This is the single source of truth for the game world —
 * `supabase/migrations/*_continent_seed.sql` mirrors it row for row, so the
 * client behaves identically whether the catalogue comes from Postgres or from
 * here.
 *
 * Coordinates live in the same space as `src/game/terrain.ts`. Every zone sits
 * on land and inside one of the three surveyed discs of `PUBLIC_ZONES` — the
 * rest of the continent is greyed out, so a zone outside them would be
 * unreachable on the map.
 */

export type ZoneKind = 'base' | 'plain' | 'forest' | 'mountain' | 'coast' | 'swamp' | 'ruins' | 'cave'

/** Terrain slows you down on the way *in*. 1 = open ground. */
export const ZONE_DIFFICULTY: Record<ZoneKind, number> = {
  base: 1,
  plain: 1.05,
  coast: 1.15,
  ruins: 1.2,
  forest: 1.3,
  swamp: 1.5,
  cave: 1.6,
  mountain: 1.85,
}

export interface ContinentZone {
  code: string
  name: string
  kind: ZoneKind
  x: number
  y: number
  radius: number
  /** Which surveyed disc it belongs to — the region its elevator serves. */
  region: 'nord' | 'ouest' | 'sud-est'
  danger: number
}

export const CONTINENT_ZONES: readonly ContinentZone[] = [
  // Région nord — l'ascenseur du plateau de fer.
  { code: 'base-nord', name: 'Ascenseur Nord', kind: 'base', x: 1520, y: 520, radius: 90, region: 'nord', danger: 1 },
  { code: 'crete-fer', name: 'Crête de Fer', kind: 'mountain', x: 1560, y: 690, radius: 110, region: 'nord', danger: 4 },
  { code: 'bois-nord', name: 'Bois du Nord', kind: 'forest', x: 1350, y: 430, radius: 120, region: 'nord', danger: 2 },
  { code: 'terrasses', name: 'Terrasses', kind: 'plain', x: 1700, y: 620, radius: 115, region: 'nord', danger: 2 },

  // Région ouest — l'ascenseur du vieux camp.
  { code: 'base-ouest', name: 'Ascenseur Ouest', kind: 'base', x: 760, y: 700, radius: 90, region: 'ouest', danger: 1 },
  { code: 'pinede', name: 'Pinède', kind: 'forest', x: 930, y: 610, radius: 120, region: 'ouest', danger: 2 },
  { code: 'vieux-camp', name: 'Vieux Camp', kind: 'ruins', x: 760, y: 930, radius: 110, region: 'ouest', danger: 3 },
  { code: 'marais-bas', name: 'Marais Bas', kind: 'swamp', x: 620, y: 830, radius: 105, region: 'ouest', danger: 3 },
  { code: 'anse-ouest', name: "Anse de l'Ouest", kind: 'coast', x: 570, y: 620, radius: 100, region: 'ouest', danger: 2 },

  // Région sud-est — l'ascenseur des salants.
  { code: 'base-sud-est', name: 'Ascenseur Sud-Est', kind: 'base', x: 1450, y: 1030, radius: 90, region: 'sud-est', danger: 1 },
  { code: 'salants', name: 'Marais Salants', kind: 'swamp', x: 1680, y: 1030, radius: 110, region: 'sud-est', danger: 3 },
  { code: 'ruines-basses', name: 'Ruines Basses', kind: 'ruins', x: 1300, y: 1150, radius: 115, region: 'sud-est', danger: 4 },
  { code: 'plaine-sud', name: 'Plaine Sud', kind: 'plain', x: 1460, y: 1215, radius: 120, region: 'sud-est', danger: 2 },
  { code: 'grotte-noire', name: 'Grotte Noire', kind: 'cave', x: 1570, y: 900, radius: 100, region: 'sud-est', danger: 5 },
]

export interface ContinentAction extends ActionDef {
  /** Terrain kinds that offer the action by default. */
  zoneKinds: readonly ZoneKind[]
  /** Experience granted on completion. */
  xp: number
}

export const CONTINENT_ACTIONS: readonly ContinentAction[] = [
  {
    id: 'forage', name: 'Récolter', duration: 15, zoneKinds: ['forest', 'plain', 'coast', 'swamp'],
    yields: { wood: 2, food: 1 }, xp: 8,
  },
  {
    id: 'hunt', name: 'Chasser', duration: 25, zoneKinds: ['forest', 'plain', 'swamp'],
    yields: { food: 2, pelt: 0.7 }, xp: 12,
  },
  {
    id: 'mine', name: 'Miner', duration: 30, skill: 'mining', zoneKinds: ['mountain', 'cave'],
    yields: { metal: 3, crystal: 0.5 }, xp: 16,
  },
  {
    id: 'scavenge', name: 'Fouiller', duration: 30, skill: 'languages', zoneKinds: ['ruins'],
    yields: { crystal: 0.8, metal: 1, relic: 0.25 }, xp: 18,
  },
  {
    id: 'explore', name: 'Explorer', duration: 20, skill: 'shortcuts',
    zoneKinds: ['plain', 'forest', 'mountain', 'coast', 'swamp', 'ruins', 'cave'],
    yields: {}, xp: 25,
  },
  {
    id: 'build', name: 'Construire une cache', duration: 40, skill: 'crafts',
    zoneKinds: ['forest', 'mountain', 'cave', 'ruins'], yields: {}, xp: 20,
  },
  { id: 'rest', name: 'Se reposer', duration: 10, skill: 'endurance', zoneKinds: ['base', 'plain', 'forest'], yields: {}, xp: 2 },
  // Unlocked by events only — no terrain offers it.
  { id: 'rich-seam', name: 'Exploiter un filon précieux', duration: 25, skill: 'mining', zoneKinds: [], yields: { crystal: 2, relic: 0.5 }, xp: 30 },
]

export interface ItemDef {
  code: string
  name: string
  value: number
}

export const ITEMS: readonly ItemDef[] = [
  { code: 'wood', name: 'Bois', value: 2 },
  { code: 'food', name: 'Nourriture', value: 3 },
  { code: 'metal', name: 'Métal', value: 5 },
  { code: 'pelt', name: 'Peau', value: 8 },
  { code: 'crystal', name: 'Cristal', value: 20 },
  { code: 'relic', name: 'Relique', value: 45 },
]

export const ITEM_VALUES: Readonly<Record<string, number>> = Object.fromEntries(
  ITEMS.map((item) => [item.code, item.value]),
)

/** Map units covered per minute at pace 1 on difficulty-1 ground. */
export const PACE_UNITS_PER_MINUTE = 2.6

/** Refuse to start a step unless the worst case still leaves this much room. */
export const SAFETY_MARGIN = 25

export function actionsForKind(kind: ZoneKind): string[] {
  return CONTINENT_ACTIONS.filter((action) => action.zoneKinds.includes(kind)).map((action) => action.id)
}

export interface WorldShape {
  zones: readonly ContinentZone[]
  actions: readonly ContinentAction[]
}

export const CONTINENT: WorldShape = { zones: CONTINENT_ZONES, actions: CONTINENT_ACTIONS }

export interface BuildWorldOptions {
  /** Which elevator the day starts and ends at. */
  landingZoneId: string
  /** Per-terrain difficulty relief from upgrades (climbing, swimming…). */
  terrainRelief?: Readonly<Partial<Record<ZoneKind, number>>>
  /** Sunrise shift, in minutes. Negative = a camp upgrade got you up earlier. */
  sunriseShift?: number
  shape?: WorldShape
}

/**
 * Builds the `World` the domain runs on. Called once per expedition: the
 * landing zone is the chosen elevator, and the player's upgrades are baked in
 * as terrain relief and a shifted sunrise.
 */
export function buildWorld(options: BuildWorldOptions): World {
  const { landingZoneId, terrainRelief = {}, sunriseShift = 0, shape = CONTINENT } = options

  const zones: Zone[] = shape.zones.map((zone) => ({
    id: zone.code,
    name: zone.name,
    kind: zone.kind,
    x: zone.x,
    y: zone.y,
    difficulty: Math.max(1, ZONE_DIFFICULTY[zone.kind] * (terrainRelief[zone.kind] ?? 1)),
    actions: actionsForKind(zone.kind),
  }))

  return createWorld({
    zones,
    actions: shape.actions.map(({ id, name, duration, skill, yields }) => ({ id, name, duration, skill, yields })),
    landingZoneId,
    cycle: { ...DEFAULT_CYCLE, sunrise: DEFAULT_CYCLE.sunrise + sunriseShift },
    paceUnitsPerMinute: PACE_UNITS_PER_MINUTE,
    safetyMargin: SAFETY_MARGIN,
  })
}

export const BASE_ZONES = CONTINENT_ZONES.filter((zone) => zone.kind === 'base')

/** Encounters on the continent. Weighted, terrain- and time-aware. */
export const CONTINENT_EVENTS: EventTable = {
  chancePerStep: 0.3,
  events: [
    {
      id: 'rich-seam', label: 'Un filon précieux affleure', weight: 3,
      zoneKinds: ['mountain', 'cave'], effect: { type: 'unlock', action: 'rich-seam' },
    },
    {
      id: 'cache', label: 'Une cache oubliée sous les gravats', weight: 2,
      zoneKinds: ['ruins'], effect: { type: 'unlock', action: 'scavenge' },
    },
    { id: 'storm', label: 'Une bourrasque se lève', weight: 3, effect: { type: 'pace', multiplier: 0.85 } },
    { id: 'mud', label: 'Le terrain se gorge d\'eau', weight: 2, zoneKinds: ['swamp', 'coast'], effect: { type: 'pace', multiplier: 0.8 } },
    { id: 'sprain', label: 'Cheville tordue', weight: 2, effect: { type: 'delay', minutes: 25 } },
    { id: 'nightfall', label: 'La lumière tombe plus vite que prévu', weight: 3, phases: ['dusk'], effect: { type: 'delay', minutes: 20 } },
    { id: 'tracks', label: 'Des traces fraîches', weight: 3, phases: ['day'], effect: { type: 'notice' } },
    { id: 'signal', label: 'Un signal lointain depuis l\'orbite', weight: 2, effect: { type: 'notice' } },
  ],
}
