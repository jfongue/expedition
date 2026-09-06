import { CONTINENT_ACTIONS, CONTINENT_ZONES, ITEMS, ZONE_DIFFICULTY } from './continent'

/**
 * Renders the catalogue of `continent.ts` as the SQL seed. Generated rather
 * than hand-written, and checked by `continentSeed.test.ts` against the
 * committed migration — the client and the database cannot drift apart.
 */
export function continentSeedSql(): string {
  return [
    header,
    zonesSql(),
    actionsSql(),
    itemsSql(),
    footer,
  ].join('\n\n') + '\n'
}

const header = `-- The continent, as the client knows it. GENERATED from src/domain/continent.ts
-- by src/domain/continentSeed.ts — do not edit by hand: run \`npm run seed:sql\`
-- and commit the result. src/domain/continentSeed.test.ts fails if the two
-- drift apart.
--
-- Coordinates are the world space of src/game/terrain.ts. Every zone sits on
-- land and inside a surveyed disc, which is what makes it reachable on the map.`

const footer = `-- Zone-specific offerings stay empty: what a zone offers follows from its
-- kind (actions.zone_kinds), and events unlock the rest at runtime.`

function zonesSql(): string {
  const rows = CONTINENT_ZONES.map((zone) => {
    const difficulty = round(ZONE_DIFFICULTY[zone.kind])
    return `  (${quote(zone.code)}, ${quote(zone.name)}, ${quote(zone.kind)}, ${zone.x}, ${zone.y}, ` +
      `${zone.radius}, ${difficulty}, true, ${zone.kind === 'base'}, ${zone.danger})`
  })

  return `insert into zones (code, name, kind, center_x, center_y, radius, difficulty, is_public, has_elevator, danger) values
${rows.join(',\n')}
on conflict (code) do update set
  name = excluded.name,
  kind = excluded.kind,
  center_x = excluded.center_x,
  center_y = excluded.center_y,
  radius = excluded.radius,
  difficulty = excluded.difficulty,
  is_public = excluded.is_public,
  has_elevator = excluded.has_elevator,
  danger = excluded.danger;`
}

function actionsSql(): string {
  const rows = CONTINENT_ACTIONS.map((action) => {
    const kinds = action.zoneKinds.length
      ? `array[${action.zoneKinds.map(quote).join(',')}]::text[]`
      : `'{}'::text[]`

    return `  (${quote(action.id)}, ${quote(action.name)}, ${kinds}, ` +
      `${action.duration * 60}, ${action.skill ? quote(action.skill) : 'null'}, ` +
      `${quote(JSON.stringify(action.yields ?? {}))}::jsonb, ${action.xp})`
  })

  return `insert into actions (code, name, zone_kinds, base_duration_seconds, skill_code, yields, xp) values
${rows.join(',\n')}
on conflict (code) do update set
  name = excluded.name,
  zone_kinds = excluded.zone_kinds,
  base_duration_seconds = excluded.base_duration_seconds,
  skill_code = excluded.skill_code,
  yields = excluded.yields,
  xp = excluded.xp;`
}

function itemsSql(): string {
  const rows = ITEMS.map((item) => `  (${quote(item.code)}, ${quote(item.name)}, 'resource', true, ${item.value})`)

  return `insert into items (code, name, kind, stackable, base_value) values
${rows.join(',\n')}
on conflict (code) do update set
  name = excluded.name,
  base_value = excluded.base_value;`
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
