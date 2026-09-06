import type { ContinentZone } from '../domain'
import type { PlayerPresence } from '../lib/presence'

/**
 * The seam between React and Phaser. React owns the game state and pushes a
 * view of it here; the scene subscribes and redraws its overlay. Clicks travel
 * the other way. Neither side holds a reference to the other, which keeps the
 * scene safe to destroy and remount.
 */
export interface MapMarker {
  x: number
  y: number
  color: string
  label: string
  /** Drawn hollow for other players, filled for the player themselves. */
  self: boolean
}

export interface MapView {
  zones: readonly ContinentZone[]
  /** The elevator of the day: drawn as the anchor of the route. */
  landingZoneId: string | null
  /** Zone codes in plan order — the dashed route, starting at the landing zone. */
  route: readonly string[]
  /** The leg being walked right now, drawn solid. */
  leg: { from: string; to: string; progress: number } | null
  /** Zones the player may click. Empty means clicking is disabled. */
  selectable: readonly string[]
  /** Where the player stands. */
  self: MapMarker | null
  others: readonly PlayerPresence[]
}

export const EMPTY_VIEW: MapView = {
  zones: [],
  landingZoneId: null,
  route: [],
  leg: null,
  selectable: [],
  self: null,
  others: [],
}

type ViewListener = (view: MapView) => void
type ZoneListener = (zoneCode: string) => void

class MapBridge {
  view: MapView = EMPTY_VIEW
  private viewListeners = new Set<ViewListener>()
  private zoneListeners = new Set<ZoneListener>()

  setView(view: MapView) {
    this.view = view
    for (const listener of this.viewListeners) listener(view)
  }

  subscribe(listener: ViewListener) {
    this.viewListeners.add(listener)
    listener(this.view)
    return () => {
      this.viewListeners.delete(listener)
    }
  }

  /** Called by the scene when a zone is tapped. */
  clickZone(zoneCode: string) {
    for (const listener of this.zoneListeners) listener(zoneCode)
  }

  onZoneClick(listener: ZoneListener) {
    this.zoneListeners.add(listener)
    return () => {
      this.zoneListeners.delete(listener)
    }
  }
}

export const mapBridge = new MapBridge()

export function zoneByCode(view: MapView, code: string | null | undefined): ContinentZone | undefined {
  return code ? view.zones.find((zone) => zone.code === code) : undefined
}

/** World position of a point `progress` of the way from one zone to another. */
export function pointBetween(
  view: MapView,
  fromCode: string,
  toCode: string,
  progress: number,
): { x: number; y: number } | null {
  const from = zoneByCode(view, fromCode)
  const to = zoneByCode(view, toCode)
  if (!from || !to) return null

  const t = Math.min(1, Math.max(0, progress))
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}
