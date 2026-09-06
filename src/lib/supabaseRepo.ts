import type { ContinentZone, ZoneKind } from '../domain'
import { CONTINENT_ACTIONS, type ContinentAction, type WorldShape } from '../domain'
import { freshProfile, type Repo, type RunRecord } from './repo'
import { supabase } from './supabaseClient'

/**
 * The Postgres-backed repository. Zones, actions and their yields come from the
 * catalogue tables, so the world can be retuned without shipping a new client;
 * the player's day, purse, upgrades and inventory live in their own rows, and
 * every finished run is written back as an expedition with its settlement.
 */

interface ZoneRow {
  id: string
  code: string
  name: string
  kind: ZoneKind
  center_x: number
  center_y: number
  radius: number
  difficulty: number
  danger: number
  has_elevator: boolean
}

interface ActionRow {
  code: string
  name: string
  zone_kinds: ZoneKind[]
  base_duration_seconds: number
  skill_code: string | null
  yields: Record<string, number>
  xp: number
}

interface SettlementRow {
  gross_credits: number
  tax_credits: number
  rescue_credits: number
  bonus_credits: number
  net_credits: number
  xp_gained: number
  loot: Record<string, number> | null
  expeditions: {
    name: string
    day: number
    seed: number
    mission_code: string
    tax_rate: number
    outcome: RunRecord['outcome'] | null
    objective_action_code: string
  } | null
}

/** Zones carry no region column: the surveyed disc is derived from the closest elevator. */
function regionOf(zone: ZoneRow, elevators: readonly ZoneRow[]): ContinentZone['region'] {
  const nearest = [...elevators].sort(
    (a, b) =>
      Math.hypot(a.center_x - zone.center_x, a.center_y - zone.center_y) -
      Math.hypot(b.center_x - zone.center_x, b.center_y - zone.center_y),
  )[0]

  return (nearest?.code.replace(/^base-/, '') ?? 'nord') as ContinentZone['region']
}

export function createSupabaseRepo(): Repo {
  /** code -> uuid, filled by `loadShape` and needed to write foreign keys. */
  const zoneIds = new Map<string, string>()

  return {
    mode: 'supabase',

    async loadShape(): Promise<WorldShape | null> {
      const [zones, actions] = await Promise.all([
        supabase.from('zones').select('*').order('code'),
        supabase.from('actions').select('*').order('code'),
      ])

      if (zones.error || actions.error || !zones.data?.length) return null

      const zoneRows = zones.data as ZoneRow[]
      const elevators = zoneRows.filter((zone) => zone.has_elevator || zone.kind === 'base')

      zoneIds.clear()
      for (const zone of zoneRows) zoneIds.set(zone.code, zone.id)

      const shaped: ContinentZone[] = zoneRows.map((zone) => ({
        code: zone.code,
        name: zone.name,
        kind: zone.kind,
        x: zone.center_x,
        y: zone.center_y,
        radius: zone.radius,
        region: regionOf(zone, elevators),
        danger: zone.danger,
      }))

      const actionRows = actions.data as ActionRow[]
      const shapedActions: ContinentAction[] = actionRows.map((action) => ({
        id: action.code,
        name: action.name,
        duration: Math.max(1, Math.round(action.base_duration_seconds / 60)),
        skill: action.skill_code ?? undefined,
        yields: action.yields ?? {},
        zoneKinds: action.zone_kinds ?? [],
        xp: action.xp,
      }))

      return {
        zones: shaped,
        // An older catalogue may predate an action the client relies on.
        actions: shapedActions.length ? shapedActions : CONTINENT_ACTIONS,
      }
    },

    async loadProfile(seed) {
      const [player, upgrades, inventory] = await Promise.all([
        supabase.from('players').select('*').eq('id', seed.playerId).maybeSingle(),
        supabase.from('player_upgrades').select('upgrade_code, level').eq('player_id', seed.playerId),
        supabase.from('player_inventory').select('item_code, quantity').eq('player_id', seed.playerId),
      ])

      const base = freshProfile(seed)
      const row = player.data

      // The auth trigger normally creates the row; do it here too so a project
      // whose trigger predates this schema still works.
      if (!row) {
        await supabase.from('players').upsert({
          id: seed.playerId, username: seed.username, color: seed.color,
          day: base.day, credits: base.credits, xp: base.xp,
        })
      }

      return {
        ...base,
        username: row?.username ?? base.username,
        color: row?.color ?? base.color,
        day: row?.day ?? base.day,
        xp: row?.xp ?? base.xp,
        credits: row?.credits ?? base.credits,
        rested: row?.rested ?? false,
        upgrades: Object.fromEntries((upgrades.data ?? []).map((u) => [u.upgrade_code, u.level])),
        inventory: Object.fromEntries((inventory.data ?? []).map((i) => [i.item_code, i.quantity])),
      }
    },

    async saveProfile(profile) {
      await supabase.from('players').upsert({
        id: profile.playerId,
        username: profile.username,
        color: profile.color,
        day: profile.day,
        xp: profile.xp,
        credits: profile.credits,
        rested: profile.rested,
        last_seen_at: new Date().toISOString(),
      })

      const upgradeRows = Object.entries(profile.upgrades).map(([upgrade_code, level]) => ({
        player_id: profile.playerId, upgrade_code, level,
      }))
      if (upgradeRows.length) await supabase.from('player_upgrades').upsert(upgradeRows)

      const inventoryRows = Object.entries(profile.inventory).map(([item_code, quantity]) => ({
        player_id: profile.playerId, item_code, quantity,
      }))
      if (inventoryRows.length) await supabase.from('player_inventory').upsert(inventoryRows)
    },

    async recordRun(profile, run) {
      const { data, error } = await supabase
        .from('expeditions')
        .insert({
          name: run.missionName,
          organizer_id: profile.playerId,
          target_zone_id: zoneIds.get(run.objectiveZoneId) ?? null,
          status: 'returned',
          outcome: run.outcome,
          day: run.day,
          seed: run.seed,
          mission_code: run.missionId,
          objective_action_code: run.objectiveActionId,
          objective_zone_id: zoneIds.get(run.objectiveZoneId) ?? null,
          tax_rate: run.taxRate,
          bonus_credits: run.settlement.bonus,
        })
        .select('id')
        .single()

      if (error || !data) return

      await supabase.from('expedition_members').insert({
        expedition_id: data.id,
        player_id: profile.playerId,
        role: 'organizer',
        status: run.outcome === 'stranded' ? 'lost' : 'returned',
        gross_credits: run.settlement.gross,
        tax_credits: run.settlement.tax,
        rescue_credits: run.settlement.rescueFee,
        bonus_credits: run.settlement.bonus,
        net_credits: run.settlement.net,
        xp_gained: run.settlement.xp,
        loot: run.settlement.lootKept,
        settled_at: new Date().toISOString(),
      })

      // The journal doubles as the catch-up feed when a player comes back.
      const events = run.highlights.map((highlight) => ({
        player_id: profile.playerId,
        expedition_id: data.id,
        kind: 'run',
        title: highlight.text,
        payload: { at: highlight.at, day: run.day },
      }))
      if (events.length) await supabase.from('events').insert(events)
    },

    async listRuns(playerId, limit = 20) {
      const { data, error } = await supabase
        .from('expedition_members')
        .select(
          'gross_credits, tax_credits, rescue_credits, bonus_credits, net_credits, xp_gained, loot,' +
            ' expeditions!inner(name, day, seed, mission_code, tax_rate, outcome, objective_action_code)',
        )
        .eq('player_id', playerId)
        .order('joined_at', { ascending: false })
        .limit(limit)

      if (error || !data) return []

      return (data as unknown as SettlementRow[]).flatMap((row) => {
        const expedition = row.expeditions
        if (!expedition) return []

        return [{
          day: expedition.day,
          missionId: expedition.mission_code,
          missionName: expedition.name,
          baseZoneId: '',
          objectiveZoneId: '',
          objectiveActionId: expedition.objective_action_code,
          taxRate: expedition.tax_rate,
          seed: expedition.seed,
          departAt: 0,
          arrivedAt: 0,
          outcome: expedition.outcome ?? 'on-time',
          objectiveMet: row.bonus_credits > 0,
          loot: row.loot ?? {},
          highlights: [],
          settlement: {
            outcome: expedition.outcome ?? 'on-time',
            lootKept: row.loot ?? {},
            gross: row.gross_credits,
            tax: row.tax_credits,
            rescueFee: row.rescue_credits,
            bonus: row.bonus_credits,
            net: row.net_credits,
            xp: row.xp_gained,
          },
        } satisfies RunRecord]
      })
    },
  }
}

/**
 * Picks a repository. The probe is a single cheap select: if the migrations
 * have not been pushed to the project, the game runs on local storage instead
 * of failing to boot, and says so.
 */
export async function probeSupabase(): Promise<string | null> {
  const { error } = await supabase.from('zones').select('code').limit(1)
  if (!error) return null

  return error.code === 'PGRST205'
    ? 'Le schéma Explorateurs n’est pas encore appliqué sur le projet Supabase (supabase db push).'
    : `Supabase inaccessible : ${error.message}`
}
