import Phaser from 'phaser'
import { getIdentity, joinMapPresence, onPlayersChange, trackPosition } from '../lib/presence'
import type { PlayerPresence } from '../lib/presence'

const TILE_SIZE = 64
const MAP_COLS = 10
const MAP_ROWS = 8

export class MapScene extends Phaser.Scene {
  private userId = ''
  private color = '#ffffff'
  private tokens = new Map<string, Phaser.GameObjects.Arc>()
  private destroyed = false
  private unsubscribe?: () => void

  constructor() {
    super('map')
  }

  async create() {
    this.events.once('destroy', () => {
      this.destroyed = true
      this.unsubscribe?.()
    })

    this.drawGrid()

    const identity = await getIdentity()
    if (this.destroyed) return

    this.userId = identity.userId
    this.color = identity.color

    joinMapPresence(this.userId)
    this.unsubscribe = onPlayersChange((players) => this.renderPlayers(players))

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const col = Phaser.Math.Clamp(Math.floor(pointer.x / TILE_SIZE), 0, MAP_COLS - 1)
      const row = Phaser.Math.Clamp(Math.floor(pointer.y / TILE_SIZE), 0, MAP_ROWS - 1)
      this.moveTo(col, row)
    })

    this.moveTo(0, 0)
  }

  private moveTo(col: number, row: number) {
    void trackPosition({ userId: this.userId, color: this.color, x: col, y: row })
  }

  private renderPlayers(players: PlayerPresence[]) {
    const seen = new Set<string>()

    for (const player of players) {
      seen.add(player.userId)

      const px = player.x * TILE_SIZE + TILE_SIZE / 2
      const py = player.y * TILE_SIZE + TILE_SIZE / 2

      let token = this.tokens.get(player.userId)
      if (!token) {
        token = this.add.circle(px, py, TILE_SIZE / 3, Phaser.Display.Color.HexStringToColor(player.color).color)
        if (player.userId === this.userId) token.setStrokeStyle(3, 0xffffff)
        this.tokens.set(player.userId, token)
      } else {
        this.tweens.add({ targets: token, x: px, y: py, duration: 150 })
      }
    }

    for (const [id, token] of this.tokens) {
      if (!seen.has(id)) {
        token.destroy()
        this.tokens.delete(id)
      }
    }
  }

  private drawGrid() {
    const graphics = this.add.graphics({ lineStyle: { width: 1, color: 0x334155 } })
    for (let col = 0; col <= MAP_COLS; col++) {
      graphics.lineBetween(col * TILE_SIZE, 0, col * TILE_SIZE, MAP_ROWS * TILE_SIZE)
    }
    for (let row = 0; row <= MAP_ROWS; row++) {
      graphics.lineBetween(0, row * TILE_SIZE, MAP_COLS * TILE_SIZE, row * TILE_SIZE)
    }
  }
}

export const MAP_WIDTH = MAP_COLS * TILE_SIZE
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE
