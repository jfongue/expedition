import type { WorldShape } from '../domain'
import type { ExpeditionOutcome, LootBag, Settlement } from '../domain'

/**
 * Everything that has to outlive a page reload. Two implementations: Postgres
 * through Supabase, and a local one for when the schema has not been pushed to
 * the project yet — `createRepo` probes once and picks. The game never talks to
 * either directly.
 */
export interface Profile {
  playerId: string
  username: string
  color: string
  /** Which day of the macro loop the player is on. */
  day: number
  xp: number
  credits: number
  /** Earned by spending a day at camp; consumed by the next expedition. */
  rested: boolean
  upgrades: Record<string, number>
  /** What is stored at camp, after every settlement. */
  inventory: Record<string, number>
}

export interface RunRecord {
  day: number
  missionId: string
  missionName: string
  baseZoneId: string
  objectiveZoneId: string
  objectiveActionId: string
  taxRate: number
  seed: number
  departAt: number
  arrivedAt: number
  outcome: ExpeditionOutcome
  objectiveMet: boolean
  settlement: Settlement
  loot: LootBag
  /** Headlines from the run log, for the journal. */
  highlights: readonly { at: number; text: string }[]
}

export type RepoMode = 'supabase' | 'local'

export interface Repo {
  readonly mode: RepoMode
  /** Why the local repo was chosen, when it was. */
  readonly reason?: string
  /** The world catalogue, or null to fall back to the built-in continent. */
  loadShape(): Promise<WorldShape | null>
  loadProfile(seed: ProfileSeed): Promise<Profile>
  saveProfile(profile: Profile): Promise<void>
  recordRun(profile: Profile, run: RunRecord): Promise<void>
  listRuns(playerId: string, limit?: number): Promise<RunRecord[]>
}

export interface ProfileSeed {
  playerId: string
  username: string
  color: string
}

export function freshProfile(seed: ProfileSeed): Profile {
  return {
    ...seed,
    day: 1,
    xp: 0,
    credits: 120,
    rested: false,
    upgrades: {},
    inventory: {},
  }
}

// --- local repository --------------------------------------------------------

const PROFILE_KEY = 'expedition:profile'
const RUNS_KEY = 'expedition:runs'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing, quota, or no storage at all: the day still plays out,
    // it just will not be there tomorrow.
  }
}

export function createLocalRepo(reason: string): Repo {
  return {
    mode: 'local',
    reason,

    async loadShape() {
      return null
    },

    async loadProfile(seed) {
      const stored = read<Profile | null>(`${PROFILE_KEY}:${seed.playerId}`, null)
      return stored ? { ...freshProfile(seed), ...stored, playerId: seed.playerId } : freshProfile(seed)
    },

    async saveProfile(profile) {
      write(`${PROFILE_KEY}:${profile.playerId}`, profile)
    },

    async recordRun(profile, run) {
      const key = `${RUNS_KEY}:${profile.playerId}`
      write(key, [run, ...read<RunRecord[]>(key, [])].slice(0, 50))
    },

    async listRuns(playerId, limit = 20) {
      return read<RunRecord[]>(`${RUNS_KEY}:${playerId}`, []).slice(0, limit)
    },
  }
}
