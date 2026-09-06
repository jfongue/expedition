import Phaser from 'phaser'

export const WORLD_WIDTH = 2400
export const WORLD_HEIGHT = 1600

const CENTRE_X = 1200
const CENTRE_Y = 800
const RADIUS_X = 830
const RADIUS_Y = 540

const PEAKS = [
  { x: 1520, y: 690, rx: 300, ry: 225, amp: 0.66 },
  { x: 980, y: 610, rx: 245, ry: 190, amp: 0.5 },
  { x: 1710, y: 1010, rx: 205, ry: 165, amp: 0.42 },
  { x: 760, y: 990, rx: 185, ry: 155, amp: 0.31 },
]

// Layered harmonics instead of a plain ellipse: this is what gives the coast
// headlands and bays rather than a bean shape.
function coastFactor(theta: number) {
  return (
    1 +
    0.17 * Math.sin(3 * theta + 0.9) +
    0.1 * Math.sin(5 * theta + 2.1) +
    0.06 * Math.sin(8 * theta - 1.2) +
    0.035 * Math.sin(13 * theta + 0.4)
  )
}

export function coastlinePoints(count = 260) {
  const points: Phaser.Math.Vector2[] = []

  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2
    const factor = coastFactor(theta)
    points.push(
      new Phaser.Math.Vector2(
        CENTRE_X + Math.cos(theta) * RADIUS_X * factor,
        CENTRE_Y + Math.sin(theta) * RADIUS_Y * factor,
      ),
    )
  }

  return points
}

export function islandBounds() {
  const points = coastlinePoints(120)
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)

  return new Phaser.Geom.Rectangle(minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY)
}

export function heightAt(x: number, y: number) {
  const dx = (x - CENTRE_X) / RADIUS_X
  const dy = (y - CENTRE_Y) / RADIUS_Y
  const radius = Math.hypot(dx, dy)
  const edge = coastFactor(Math.atan2(dy, dx))

  const base = 1 - radius / edge
  if (base <= 0) return 0

  let height = Math.pow(base, 0.9) * 0.45

  for (const peak of PEAKS) {
    const px = (x - peak.x) / peak.rx
    const py = (y - peak.y) / peak.ry
    height += peak.amp * Math.exp(-(px * px + py * py) * 1.6)
  }

  height += 0.03 * Math.sin(x / 210) * Math.cos(y / 170) + 0.02 * Math.sin(x / 95 + y / 130)

  // Taper to zero at the shore so contours close before the coastline.
  return height * Math.min(1, base * 4)
}

export function isLand(x: number, y: number) {
  const dx = (x - CENTRE_X) / RADIUS_X
  const dy = (y - CENTRE_Y) / RADIUS_Y
  return Math.hypot(dx, dy) < coastFactor(Math.atan2(dy, dx))
}

interface Grid {
  step: number
  cols: number
  rows: number
  minX: number
  minY: number
  values: Float32Array
}

function buildGrid(step: number): Grid {
  const minX = CENTRE_X - RADIUS_X * 1.35
  const minY = CENTRE_Y - RADIUS_Y * 1.35
  const cols = Math.ceil((RADIUS_X * 2.7) / step) + 1
  const rows = Math.ceil((RADIUS_Y * 2.7) / step) + 1
  const values = new Float32Array(cols * rows)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      values[row * cols + col] = heightAt(minX + col * step, minY + row * step)
    }
  }

  return { step, cols, rows, minX, minY, values }
}

function interpolate(a: number, b: number, level: number) {
  const delta = b - a
  return Math.abs(delta) < 1e-6 ? 0.5 : (level - a) / delta
}

// Marching squares: the standard way to pull iso-lines out of a height field,
// which is exactly what a topographic contour is.
function marchingSquares(grid: Grid, level: number) {
  const segments: [number, number, number, number][] = []
  const { step, cols, rows, minX, minY, values } = grid

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const tl = values[row * cols + col]
      const tr = values[row * cols + col + 1]
      const br = values[(row + 1) * cols + col + 1]
      const bl = values[(row + 1) * cols + col]

      let code = 0
      if (tl > level) code |= 8
      if (tr > level) code |= 4
      if (br > level) code |= 2
      if (bl > level) code |= 1
      if (code === 0 || code === 15) continue

      const x = minX + col * step
      const y = minY + row * step

      const top = { x: x + step * interpolate(tl, tr, level), y }
      const right = { x: x + step, y: y + step * interpolate(tr, br, level) }
      const bottom = { x: x + step * interpolate(bl, br, level), y: y + step }
      const left = { x, y: y + step * interpolate(tl, bl, level) }

      const push = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        segments.push([a.x, a.y, b.x, b.y])

      switch (code) {
        case 1: case 14: push(left, bottom); break
        case 2: case 13: push(bottom, right); break
        case 3: case 12: push(left, right); break
        case 4: case 11: push(top, right); break
        case 6: case 9: push(top, bottom); break
        case 7: case 8: push(left, top); break
        case 5: push(left, top); push(bottom, right); break
        case 10: push(left, bottom); push(top, right); break
      }
    }
  }

  return segments
}

export function contourLevels(levels: number[], step = 11) {
  const grid = buildGrid(step)
  return levels.map((level) => ({ level, segments: marchingSquares(grid, level) }))
}

function gradient(x: number, y: number) {
  const delta = 6
  return new Phaser.Math.Vector2(
    heightAt(x + delta, y) - heightAt(x - delta, y),
    heightAt(x, y + delta) - heightAt(x, y - delta),
  )
}

function descend(start: Phaser.Math.Vector2) {
  let position = start.clone()
  const path = [position.clone()]

  for (let stepIndex = 0; stepIndex < 600; stepIndex++) {
    const slope = gradient(position.x, position.y)
    if (slope.length() < 1e-6) break

    const downhill = slope.clone().normalize().scale(-1)
    // Meander: nudge sideways so rivers curve instead of falling straight.
    const meander = new Phaser.Math.Vector2(-downhill.y, downhill.x).scale(Math.sin(stepIndex / 8) * 0.45)

    position = position.clone().add(downhill.add(meander).normalize().scale(8))
    path.push(position.clone())

    if (heightAt(position.x, position.y) <= 0.01) break
  }

  return path
}

// Sources spread across the mid-elevation band, each followed downhill to the
// sea: gradient descent on the real height field keeps every stream on land and
// makes the network behave like actual drainage.
export function riverPaths() {
  const sources: Phaser.Math.Vector2[] = []
  const step = 60

  for (let y = 0; y < WORLD_HEIGHT; y += step) {
    for (let x = 0; x < WORLD_WIDTH; x += step) {
      const height = heightAt(x, y)
      if (height < 0.3 || height > 0.62) continue
      if (sources.some((s) => Phaser.Math.Distance.Between(s.x, s.y, x, y) < 190)) continue
      sources.push(new Phaser.Math.Vector2(x, y))
    }
  }

  return sources.map(descend).filter((path) => path.length > 18)
}
