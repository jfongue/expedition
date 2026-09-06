import Phaser from 'phaser'
import { getIdentity, joinMapPresence, onPlayersChange, trackPosition } from '../lib/presence'
import type { PlayerPresence } from '../lib/presence'
import { drawMap } from './mapArt'
import { WORLD_HEIGHT, WORLD_WIDTH, islandBounds } from './terrain'

const MIN_ZOOM = 0.3
const MAX_ZOOM = 3
const DRAG_THRESHOLD = 6

export class MapScene extends Phaser.Scene {
  private userId = ''
  private color = '#ffffff'
  private tokens = new Map<string, Phaser.GameObjects.Arc>()
  private destroyed = false
  private unsubscribe?: () => void

  private dragging = false
  private dragMoved = false
  private dragOrigin = new Phaser.Math.Vector2()
  private pinchDistance = 0

  constructor() {
    super('map')
  }

  async create() {
    this.events.once('destroy', () => {
      this.destroyed = true
      this.unsubscribe?.()
    })

    this.cameras.main.setBackgroundColor('#ffffff')

    drawMap(this)

    this.setupCameraControls()
    this.resetView()

    // The canvas is measured before the layout settles, so refit once it has.
    const onResize = () => this.resetView()
    this.scale.on('resize', onResize)
    this.events.once('destroy', () => this.scale.off('resize', onResize))

    const identity = await getIdentity()
    if (this.destroyed) return

    this.userId = identity.userId
    this.color = identity.color

    joinMapPresence(this.userId)
    this.unsubscribe = onPlayersChange((players) => this.renderPlayers(players))

    this.moveTo(WORLD_WIDTH / 2, WORLD_HEIGHT / 2)
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
      camera.scrollX -= dx / camera.zoom
      camera.scrollY -= dy / camera.zoom
      this.dragOrigin.set(pointer.x, pointer.y)
    })

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const wasDrag = this.dragMoved
      this.dragging = false
      this.dragMoved = false
      this.pinchDistance = 0

      // A drag pans the map; only a clean tap places your pawn.
      if (!wasDrag && !this.input.pointer2?.isDown) this.moveTo(pointer.worldX, pointer.worldY)
    })
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

    const before = camera.getWorldPoint(screenX, screenY)
    camera.setZoom(zoom)
    this.applyBounds()
    const after = camera.getWorldPoint(screenX, screenY)

    camera.scrollX += before.x - after.x
    camera.scrollY += before.y - after.y
  }

  private moveTo(x: number, y: number) {
    const position = {
      userId: this.userId,
      color: this.color,
      x: Phaser.Math.Clamp(Math.round(x), 0, WORLD_WIDTH),
      y: Phaser.Math.Clamp(Math.round(y), 0, WORLD_HEIGHT),
      updatedAt: Date.now(),
    }

    // Move locally first: waiting for the presence echo would make your own
    // pawn lag behind your tap by a network round-trip.
    this.placeToken(position)
    void trackPosition(position)
  }

  private placeToken(player: PlayerPresence) {
    let token = this.tokens.get(player.userId)

    if (!token) {
      token = this.add.circle(player.x, player.y, 9, Phaser.Display.Color.HexStringToColor(player.color).color)
      token.setStrokeStyle(2.5, 0xffffff)
      this.tokens.set(player.userId, token)
      return
    }

    if (token.x === player.x && token.y === player.y) return
    this.tweens.add({ targets: token, x: player.x, y: player.y, duration: 220, ease: 'Cubic.easeOut' })
  }

  private renderPlayers(players: PlayerPresence[]) {
    const seen = new Set<string>()

    for (const player of players) {
      seen.add(player.userId)
      this.placeToken(player)
    }

    for (const [id, token] of this.tokens) {
      if (!seen.has(id)) {
        token.destroy()
        this.tokens.delete(id)
      }
    }
  }
}
