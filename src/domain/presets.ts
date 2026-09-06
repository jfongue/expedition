import type { EventTable } from './events'
import { DEFAULT_CYCLE } from './time'
import { createWorld, type ActionDef, type World, type Zone } from './types'

/**
 * A small hand-made continent used by the tests and as a stand-in until the
 * generated map exposes real zones. Coordinates are in the same space as
 * `src/game/terrain.ts` so the wiring later is a straight swap.
 */
const ZONES: Zone[] = [
  { id: 'landing', name: 'Zone de débarquement', kind: 'landing', x: 1200, y: 800, difficulty: 1, actions: [] },
  { id: 'pine-ridge', name: 'Crête des pins', kind: 'forest', x: 980, y: 610, difficulty: 1.2, actions: ['chop', 'hunt'] },
  { id: 'iron-vein', name: 'Filon de fer', kind: 'mountain', x: 1520, y: 690, difficulty: 1.8, actions: ['mine', 'prospect'] },
  { id: 'salt-flats', name: 'Marais salants', kind: 'swamp', x: 1710, y: 1010, difficulty: 1.5, actions: ['forage'] },
  { id: 'old-camp', name: 'Ancien camp', kind: 'ruins', x: 760, y: 990, difficulty: 1.1, actions: ['explore', 'build-cache'] },
]

const ACTIONS: ActionDef[] = [
  { id: 'chop', name: 'Abattre du bois', duration: 45, skill: 'woodcraft', yields: { wood: 3 } },
  { id: 'hunt', name: 'Chasser', duration: 70, skill: 'hunting', yields: { food: 2 } },
  { id: 'mine', name: 'Miner', duration: 90, skill: 'mining', yields: { metal: 3 } },
  { id: 'prospect', name: 'Prospecter', duration: 40, skill: 'mining' },
  { id: 'forage', name: 'Récolter', duration: 35, yields: { food: 1 } },
  { id: 'explore', name: 'Explorer', duration: 60 },
  { id: 'build-cache', name: 'Construire une cachette', duration: 120, skill: 'building' },
  { id: 'rich-seam', name: 'Exploiter un filon précieux', duration: 55, skill: 'mining', yields: { gems: 1 } },
]

export function createDemoWorld(): World {
  return createWorld({
    zones: ZONES,
    actions: ACTIONS,
    landingZoneId: 'landing',
    cycle: DEFAULT_CYCLE,
    paceUnitsPerMinute: 26,
    safetyMargin: 30,
  })
}

export const DEMO_EVENTS: EventTable = {
  chancePerStep: 0.25,
  events: [
    {
      id: 'rich-seam',
      label: 'Un filon précieux affleure',
      weight: 3,
      zoneKinds: ['mountain'],
      effect: { type: 'unlock', action: 'rich-seam' },
    },
    { id: 'storm', label: 'Une bourrasque se lève', weight: 2, effect: { type: 'pace', multiplier: 0.85 } },
    { id: 'sprain', label: 'Cheville tordue', weight: 1, effect: { type: 'delay', minutes: 20 } },
    {
      id: 'tracks',
      label: 'Des traces fraîches',
      weight: 2,
      phases: ['day'],
      effect: { type: 'notice' },
    },
  ],
}
