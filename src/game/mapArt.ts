import Phaser from 'phaser'
import {
  PUBLIC_ZONES,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  coastlinePoints,
  contourLevels,
  isLand,
  riverPaths,
} from './terrain'

const COLORS = {
  land: 0xfdfdfc,
  unexplored: 0xf2f2f1,
  unexploredCoast: 0xd3d6d8,
  coast: 0x9298a0,
  halo: 0xccd3d9,
  contour: 0xdfe3e6,
  contourIndex: 0xc3c9cf,
  river: 0xa8b6c0,
  zoneEdge: 0xbfc5ca,
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

  const zones = PUBLIC_ZONES.map(zonePolygon)

  drawCoastHalo(scene, coast)
  drawUnexplored(scene, coast)
  drawSurveyed(scene, zones)
  drawZoneEdges(scene, zones)
  drawElevators(scene)
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

// The continent at large: a flat silhouette, no relief, nothing surveyed.
function drawUnexplored(scene: Phaser.Scene, coast: Phaser.Math.Vector2[]) {
  const graphics = scene.add.graphics()
  graphics.fillStyle(COLORS.unexplored, 1)
  graphics.fillPoints(coast, true)
  graphics.lineStyle(1.6, COLORS.unexploredCoast, 1)
  graphics.strokePoints(coast, true)
}

// A zone is a disc clipped to the shoreline: walking each ray outwards until it
// leaves the land keeps the surveyed patch from spilling into the sea.
function zonePolygon(zone: (typeof PUBLIC_ZONES)[number]) {
  const points: Phaser.Math.Vector2[] = []

  for (let i = 0; i < 96; i++) {
    const angle = (i / 96) * Math.PI * 2
    let inside = 0
    let outside = zone.radius

    for (let step = 0; step < 14; step++) {
      const mid = (inside + outside) / 2
      if (isLand(zone.x + Math.cos(angle) * mid, zone.y + Math.sin(angle) * mid)) inside = mid
      else outside = mid
    }

    points.push(new Phaser.Math.Vector2(zone.x + Math.cos(angle) * inside, zone.y + Math.sin(angle) * inside))
  }

  return points
}

function isSurveyed(x: number, y: number) {
  return PUBLIC_ZONES.some((zone) => Phaser.Math.Distance.Between(zone.x, zone.y, x, y) <= zone.radius)
}

// The surveyed ground, drawn only inside the public zones.
function drawSurveyed(scene: Phaser.Scene, zones: Phaser.Math.Vector2[][]) {
  const ground = scene.add.graphics()
  ground.fillStyle(COLORS.land, 1)
  for (const polygon of zones) ground.fillPoints(polygon, true)

  drawContours(scene)
  drawRivers(scene)
}

function drawContours(scene: Phaser.Scene) {
  const graphics = scene.add.graphics()

  for (const [index, { segments }] of contourLevels(CONTOUR_LEVELS).entries()) {
    // Every third contour is an index line, as on a real topographic sheet.
    const isIndex = index % 3 === 0
    graphics.lineStyle(isIndex ? 1.5 : 1, isIndex ? COLORS.contourIndex : COLORS.contour, 1)

    for (const [x1, y1, x2, y2] of segments) {
      if (!isSurveyed((x1 + x2) / 2, (y1 + y2) / 2)) continue
      graphics.lineBetween(x1, y1, x2, y2)
    }
  }
}

function drawRivers(scene: Phaser.Scene) {
  const graphics = scene.add.graphics()

  for (const path of riverPaths()) {
    // Taper the stroke downstream: headwaters are hairlines, mouths are wide.
    for (let i = 1; i < path.length; i++) {
      if (!isSurveyed(path[i].x, path[i].y)) continue
      graphics.lineStyle(0.8 + (i / path.length) * 2.4, COLORS.river, 1)
      graphics.lineBetween(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y)
    }
  }
}

function drawZoneEdges(scene: Phaser.Scene, zones: Phaser.Math.Vector2[][]) {
  const graphics = scene.add.graphics()
  graphics.lineStyle(1.3, COLORS.zoneEdge, 1)
  for (const polygon of zones) graphics.strokePoints(polygon, true)
}

function drawElevators(scene: Phaser.Scene) {
  const graphics = scene.add.graphics()

  for (const zone of PUBLIC_ZONES) {
    graphics.lineStyle(1.6, COLORS.ink, 0.75)
    graphics.strokeCircle(zone.x, zone.y, 13)
    graphics.lineBetween(zone.x - 7, zone.y, zone.x + 7, zone.y)
    graphics.lineBetween(zone.x, zone.y - 7, zone.x, zone.y + 7)
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
