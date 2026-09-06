import Phaser from 'phaser'
import { WORLD_HEIGHT, WORLD_WIDTH, coastlinePoints, contourLevels, riverPaths } from './terrain'

const COLORS = {
  land: 0xfdfdfc,
  coast: 0x9298a0,
  halo: 0xccd3d9,
  contour: 0xdfe3e6,
  contourIndex: 0xc3c9cf,
  river: 0xa8b6c0,
  ink: 0x878e96,
  label: '#878e96',
}

const LABEL_FONT = 'ui-sans-serif, system-ui, -apple-system, Helvetica, Arial, sans-serif'
const CONTOUR_LEVELS = [0.06, 0.14, 0.22, 0.3, 0.38, 0.46, 0.55, 0.64, 0.74, 0.84]

function centroid(points: Phaser.Math.Vector2[]) {
  return points
    .reduce((acc, p) => acc.add(p), new Phaser.Math.Vector2(0, 0))
    .scale(1 / points.length)
}

export function drawMap(scene: Phaser.Scene) {
  const coast = coastlinePoints()

  drawCoastHalo(scene, coast)
  drawLand(scene, coast)
  drawContours(scene)
  drawRivers(scene)
  drawCompass(scene)
  drawScaleBar(scene)
}

// Concentric offset outlines fading outwards — the nautical-chart convention
// that makes a coastline read as a shoreline rather than an outlined shape.
function drawCoastHalo(scene: Phaser.Scene, coast: Phaser.Math.Vector2[]) {
  const centre = centroid(coast)

  for (let ring = 5; ring >= 1; ring--) {
    const graphics = scene.add.graphics()
    graphics.lineStyle(1.4, COLORS.halo, 0.12 + (5 - ring) * 0.045)

    const offset = coast.map((p) => centre.clone().add(p.clone().subtract(centre).scale(1 + ring * 0.018)))
    graphics.strokePoints(offset, true)
  }
}

function drawLand(scene: Phaser.Scene, coast: Phaser.Math.Vector2[]) {
  const fill = scene.add.graphics()
  fill.fillStyle(COLORS.land, 1)
  fill.fillPoints(coast, true)

  const line = scene.add.graphics()
  line.lineStyle(1.9, COLORS.coast, 1)
  line.strokePoints(coast, true)
}

function drawContours(scene: Phaser.Scene) {
  const graphics = scene.add.graphics()

  for (const [index, { segments }] of contourLevels(CONTOUR_LEVELS).entries()) {
    // Every third contour is an index line, as on a real topographic sheet.
    const isIndex = index % 3 === 0
    graphics.lineStyle(isIndex ? 1.5 : 1, isIndex ? COLORS.contourIndex : COLORS.contour, 1)

    for (const [x1, y1, x2, y2] of segments) graphics.lineBetween(x1, y1, x2, y2)
  }
}

function drawRivers(scene: Phaser.Scene) {
  const graphics = scene.add.graphics()

  for (const path of riverPaths()) {
    // Taper the stroke downstream: headwaters are hairlines, mouths are wide.
    for (let i = 1; i < path.length; i++) {
      graphics.lineStyle(0.8 + (i / path.length) * 2.4, COLORS.river, 1)
      graphics.lineBetween(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y)
    }
  }
}

function label(scene: Phaser.Scene, x: number, y: number, text: string, size: number) {
  return scene.add
    .text(x, y, text, { fontFamily: LABEL_FONT, fontSize: `${size}px`, color: COLORS.label })
    .setLetterSpacing(3)
    .setResolution(4)
}

function drawCompass(scene: Phaser.Scene) {
  const x = WORLD_WIDTH - 280
  const y = 275
  const graphics = scene.add.graphics()

  graphics.lineStyle(1.1, COLORS.ink, 0.5)
  graphics.strokeCircle(x, y, 30)
  graphics.lineBetween(x, y - 42, x, y + 42)
  graphics.lineBetween(x - 42, y, x + 42, y)

  graphics.fillStyle(COLORS.ink, 0.8)
  graphics.fillTriangle(x, y - 42, x - 6, y - 18, x + 6, y - 18)

  label(scene, x, y - 70, 'N', 15).setOrigin(0.5, 1)
}

function drawScaleBar(scene: Phaser.Scene) {
  const x = 400
  const y = WORLD_HEIGHT - 145
  const width = 300
  const graphics = scene.add.graphics()

  graphics.lineStyle(1.1, COLORS.ink, 0.55)
  graphics.lineBetween(x, y, x + width, y)
  graphics.lineBetween(x, y - 6, x, y + 6)
  graphics.lineBetween(x + width / 2, y - 4, x + width / 2, y + 4)
  graphics.lineBetween(x + width, y - 6, x + width, y + 6)

  label(scene, x + width / 2, y + 10, '100 KM', 13).setOrigin(0.5, 0)
}
