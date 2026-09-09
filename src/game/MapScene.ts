import Phaser from 'phaser'
import { mapBridge, pointBetween, zoneByCode, type MapView } from './mapBridge'
import { drawMap } from './mapArt'
import { WORLD_HEIGHT, WORLD_WIDTH, islandBounds } from './terrain'

const MIN_ZOOM = 0.3
const MAX_ZOOM = 3
const DRAG_THRESHOLD = 6
/**
 * How close a tap must land to a zone marker, in CSS pixels. Converted to world
 * units at the current zoom, so the target stays finger-sized whether the map
 * is zoomed right out or right in.
 */
const ZONE_HIT_PX = 32

const INK = 0x3f464d
const ROUTE = 0x5b6268
const SELECTABLE = 0x9298a0

/**
 * The map. Draws the continent once, then keeps an overlay in sync with the
 * view pushed in from React: zone markers, the planned route, the walking
 * token and the other explorers.
 */
export class MapScene extends Phaser.Scene {
  private view: MapView = mapBridge.view
  private focusKey: string | null = null
  /** Set once the camera is the player's business — panned, zoomed or framed. */
  private cameraOwned = false
  private overlay!: Phaser.GameObjects.Graphics
  private labels = new Map<string, Phaser.GameObjects.Text>()
  private tokens = new Map<string, Phaser.GameObjects.Container>()
  private unsubscribe?: () => void

  private dragging = false
  private dragMoved = false
  private dragOrigin = new Phaser.Math.Vector2()
  private pinchDistance = 0

  constructor() {
    super('map')
  }

  create() {
    this.cameras.main.setBackgroundColor('#ffffff')

    drawMap(this)
    this.overlay = this.add.graphics()

    this.setupCameraControls()
    this.resetView()

    // The canvas is measured before the layout settles, so refit once it has —
    // but only while the camera is still ours: the side panel's scrollbar comes
    // and goes as screens change, and each of those resizes would otherwise
    // throw away the region framing and the player's own panning.
    const onResize = () => (this.cameraOwned ? this.applyBounds() : this.resetView())
    this.scale.on('resize', onResize)

    this.unsubscribe = mapBridge.subscribe((view) => {
      this.view = view
      this.redraw()

      if (view.focus && view.focus.key !== this.focusKey) {
        this.focusKey = view.focus.key
        this.focusRegion(view.focus.zones)
      }
    })

    this.events.once('destroy', () => {
      this.unsubscribe?.()
      this.scale.off('resize', onResize)
    })
  }

  private resetView() {
    const { width, height } = this.scale.gameSize
    if (!width || !height) return

    // Frame the island, not the world: most of the world is empty sea.
    const island = islandBounds()
    const padding = 90
    const zoom = Phaser.Math.Clamp(
      Math.min(width / (island.width + padding * 2), height / (island.height + padding * 2)),
      MIN_ZOOM,
      MAX_ZOOM,
    )

    this.cameras.main.setZoom(zoom)
    this.applyBounds()
    this.cameras.main.centerOn(island.centerX, island.centerY)
  }

  /** Frames one surveyed region, for when a mission is picked. */
  private focusRegion(codes: readonly string[]) {
    const zones = codes.map((code) => zoneByCode(this.view, code)).filter((zone) => zone !== undefined)
    if (zones.length === 0) return

    const xs = zones.map((zone) => zone.x)
    const ys = zones.map((zone) => zone.y)
    const width = Math.max(...xs) - Math.min(...xs) + 420
    const height = Math.max(...ys) - Math.min(...ys) + 420

    const camera = this.cameras.main
    const zoom = Phaser.Math.Clamp(
      Math.min(camera.width / width, camera.height / height),
      MIN_ZOOM,
      MAX_ZOOM,
    )

    // Framed immediately rather than panned: a camera animation only advances
    // while the render loop runs, and browsers stall that loop whenever the tab
    // is in the background — which would leave the map stuck mid-flight, and
    // taps hit-testing against a camera that never arrived.
    this.cameraOwned = true
    camera.setZoom(zoom)
    this.applyBounds()
    camera.centerOn((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2)
  }

  // --- overlay ---------------------------------------------------------

  private redraw() {
    if (!this.overlay) return

    this.overlay.clear()
    this.drawRoute()
    this.drawZones()
    this.drawTokens()
  }

  private drawRoute() {
    const { route, landingZoneId, leg } = this.view
    const path = [landingZoneId, ...route].filter((code): code is string => Boolean(code))

    // The plan, dashed: a route not yet walked.
    for (let index = 1; index < path.length; index++) {
      const from = zoneByCode(this.view, path[index - 1])
      const to = zoneByCode(this.view, path[index])
      if (from && to) this.dashedLine(from, to)
    }

    // The leg under way, solid up to where the explorer has got to.
    if (leg) {
      const from = zoneByCode(this.view, leg.from)
      const at = pointBetween(this.view, leg.from, leg.to, leg.progress)
      if (from && at) {
        this.overlay.lineStyle(2.4, INK, 0.85)
        this.overlay.lineBetween(from.x, from.y, at.x, at.y)
      }
    }
  }

  private dashedLine(from: { x: number; y: number }, to: { x: number; y: number }) {
    const distance = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y)
    const steps = Math.max(2, Math.round(distance / 16))

    this.overlay.lineStyle(2.2, ROUTE, 0.9)
    for (let step = 0; step < steps; step += 2) {
      const a = step / steps
      const b = Math.min(1, (step + 1) / steps)
      this.overlay.lineBetween(
        from.x + (to.x - from.x) * a,
        from.y + (to.y - from.y) * a,
        from.x + (to.x - from.x) * b,
        from.y + (to.y - from.y) * b,
      )
    }
  }

  private drawZones() {
    const selectable = new Set(this.view.selectable)
    const seen = new Set<string>()

    for (const zone of this.view.zones) {
      seen.add(zone.code)
      const isLanding = zone.code === this.view.landingZoneId
      const isSelectable = selectable.has(zone.code)

      if (isLanding) {
        // The elevator: a mast the day hangs off.
        this.overlay.lineStyle(2, INK, 0.9)
        this.overlay.strokeCircle(zone.x, zone.y, 15)
        this.overlay.strokeCircle(zone.x, zone.y, 6)
      } else {
        this.overlay.lineStyle(1.6, isSelectable ? INK : SELECTABLE, isSelectable ? 0.9 : 0.45)
        this.overlay.strokeCircle(zone.x, zone.y, 9)
      }

      if (isSelectable) {
        this.overlay.lineStyle(1, INK, 0.25)
        this.overlay.strokeCircle(zone.x, zone.y, 20)
      }

      this.zoneLabel(zone.code, zone.name, zone.x, zone.y, isLanding || isSelectable)
    }

    for (const [code, label] of this.labels) {
      if (!seen.has(code)) {
        label.destroy()
        this.labels.delete(code)
      }
    }
  }

  private zoneLabel(code: string, name: string, x: number, y: number, prominent: boolean) {
    let label = this.labels.get(code)

    if (!label) {
      label = this.add
        .text(x, y + 26, name.toUpperCase(), {
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Helvetica, Arial, sans-serif',
          fontSize: '13px',
          color: '#9298a0',
        })
        .setOrigin(0.5, 0)
        .setLetterSpacing(2)
        .setResolution(4)
      this.labels.set(code, label)
    }

    label.setColor(prominent ? '#3f464d' : '#9298a0')
  }

  private drawTokens() {
    const seen = new Set<string>()

    if (this.view.self) {
      seen.add('self')
      // Your own token carries no name: it would sit on top of the zone label,
      // and the filled disc already tells you which one is yours.
      this.placeToken('self', this.view.self.x, this.view.self.y, this.view.self.color, '', true)
    }

    for (const player of this.view.others) {
      seen.add(player.userId)
      this.placeToken(player.userId, player.x, player.y, player.color, player.username, false)
    }

    for (const [id, token] of this.tokens) {
      if (!seen.has(id)) {
        token.destroy()
        this.tokens.delete(id)
      }
    }
  }

  private placeToken(id: string, x: number, y: number, color: string, label: string, self: boolean) {
    let token = this.tokens.get(id)
    const tint = Phaser.Display.Color.HexStringToColor(color).color

    if (!token) {
      const dot = this.add.circle(0, 0, self ? 10 : 7, tint)
      dot.setStrokeStyle(self ? 3 : 2, 0xffffff)

      const parts: Phaser.GameObjects.GameObject[] = [dot]

      if (label) {
        // Above the dot: zone names sit below their marker.
        parts.push(
          this.add
            .text(0, -14, label, {
              fontFamily: 'ui-sans-serif, system-ui, -apple-system, Helvetica, Arial, sans-serif',
              fontSize: '12px',
              color: '#878e96',
            })
            .setOrigin(0.5, 1)
            .setResolution(4),
        )
      }

      token = this.add.container(x, y, parts)
      this.tokens.set(id, token)
      return
    }

    if (Math.hypot(token.x - x, token.y - y) < 0.5) return
    this.tweens.add({ targets: token, x, y, duration: 200, ease: 'Cubic.easeOut' })
  }

  // --- camera and input ------------------------------------------------

  // Panning must stay near the map, but when the view is wider than the world
  // Phaser would pin it to a corner instead of centring it — so the bounds grow
  // to at least the size of the view.
  private applyBounds() {
    const camera = this.cameras.main
    const viewWidth = Math.max(WORLD_WIDTH, camera.width / camera.zoom)
    const viewHeight = Math.max(WORLD_HEIGHT, camera.height / camera.zoom)

    camera.setBounds(
      WORLD_WIDTH / 2 - viewWidth / 2,
      WORLD_HEIGHT / 2 - viewHeight / 2,
      viewWidth,
      viewHeight,
    )
  }

  private setupCameraControls() {
    // A second pointer is needed for pinch; Phaser tracks only one by default.
    this.input.addPointer(1)

    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      this.zoomBy(dy > 0 ? 0.9 : 1.1, pointer.x, pointer.y)
    })

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.input.pointer2?.isDown) return
      this.dragging = true
      this.dragMoved = false
      this.dragOrigin.set(pointer.x, pointer.y)
    })

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.handlePinch()) return
      if (!this.dragging || !pointer.isDown) return

      const dx = pointer.x - this.dragOrigin.x
      const dy = pointer.y - this.dragOrigin.y
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) this.dragMoved = true
      if (!this.dragMoved) return

      const camera = this.cameras.main
      this.cameraOwned = true
      camera.scrollX -= dx / camera.zoom
      camera.scrollY -= dy / camera.zoom
      this.dragOrigin.set(pointer.x, pointer.y)
    })

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const wasDrag = this.dragMoved
      this.dragging = false
      this.dragMoved = false
      this.pinchDistance = 0

      // A drag pans the map; only a clean tap picks a zone.
      if (!wasDrag && !this.input.pointer2?.isDown) this.pickZone(pointer.worldX, pointer.worldY)
    })
  }

  /** Nearest selectable zone within reach of the tap, if any. */
  private pickZone(x: number, y: number) {
    const candidates = this.view.zones.filter((zone) => this.view.selectable.includes(zone.code))
    if (candidates.length === 0) return

    const nearest = candidates
      .map((zone) => ({ zone, distance: Phaser.Math.Distance.Between(zone.x, zone.y, x, y) }))
      .sort((a, b) => a.distance - b.distance)[0]

    // The canvas is rendered at device resolution and scaled down by CSS, so a
    // CSS pixel is `displayScale` game pixels, and `zoom` game pixels a world unit.
    const reach = (ZONE_HIT_PX * this.scale.displayScale.x) / this.cameras.main.zoom

    if (nearest && nearest.distance <= reach) mapBridge.clickZone(nearest.zone.code)
  }

  private handlePinch() {
    const p1 = this.input.pointer1
    const p2 = this.input.pointer2
    if (!p1.isDown || !p2?.isDown) return false

    this.dragging = false
    this.dragMoved = true

    const distance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y)
    if (this.pinchDistance > 0 && distance > 0) {
      this.zoomBy(distance / this.pinchDistance, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
    }
    this.pinchDistance = distance
    return true
  }

  // Zoom anchored on the pointer, so the point under the finger stays put.
  private zoomBy(factor: number, screenX: number, screenY: number) {
    const camera = this.cameras.main
    const zoom = Phaser.Math.Clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM)
    if (zoom === camera.zoom) return

    this.cameraOwned = true
    const before = camera.getWorldPoint(screenX, screenY)
    camera.setZoom(zoom)
    this.applyBounds()
    const after = camera.getWorldPoint(screenX, screenY)

    camera.scrollX += before.x - after.x
    camera.scrollY += before.y - after.y
  }
}
