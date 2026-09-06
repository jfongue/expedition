import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode,
} from 'react'
import {
  abortToReturn, advanceTo, generateMissions, haulOf, levelFromXp, replan, settleRun,
  startExpedition, createRunSession, sunriseShiftFrom, upgradeCost, mergeBags,
  DEFAULT_CYCLE, MINUTES_PER_DAY,
  type ExpeditionState, type Mission, type PlanStep, type RunSession, type Settlement,
  type WorldShape,
} from '../domain'
import { mapBridge } from '../game/mapBridge'
import { onChat, onPlayersChange, joinMapPresence, sendChat, trackSelf, type ChatMessage, type PlayerPresence } from '../lib/presence'
import { openSession, type Session } from '../lib/session'
import type { Profile, RunRecord } from '../lib/repo'

export type Screen = 'loading' | 'base' | 'plan' | 'run' | 'debrief'

export interface GameState {
  screen: Screen
  session: Session | null
  profile: Profile | null
  mission: Mission | null
  /** Minutes of departure pushed back past sunrise. */
  departDelay: number
  plan: readonly PlanStep[]
  run: ExpeditionState | null
  /** The live run: world, explorer and the RNG mid-stream. Stable reference. */
  runSession: RunSession | null
  /** Game minutes per real second. 0 pauses the day. */
  speed: number
  /** Ties game time to wall-clock time, so a hidden tab does not stop the day. */
  clock: { anchorReal: number; anchorGame: number } | null
  settlement: Settlement | null
  journal: readonly RunRecord[]
  players: readonly PlayerPresence[]
  chat: readonly ChatMessage[]
  error: string | null
}

const SPEEDS = [0, 15, 45, 120] as const
export const SPEED_LABELS = ['Pause', '×1', '×3', '×8'] as const

const initialState: GameState = {
  screen: 'loading',
  session: null,
  profile: null,
  mission: null,
  departDelay: 0,
  plan: [],
  run: null,
  runSession: null,
  speed: SPEEDS[2],
  clock: null,
  settlement: null,
  journal: [],
  players: [],
  chat: [],
  error: null,
}

type Action =
  | { type: 'ready'; session: Session; journal: readonly RunRecord[] }
  | { type: 'failed'; error: string }
  | { type: 'profile'; profile: Profile }
  | { type: 'choose-mission'; mission: Mission }
  | { type: 'depart-delay'; minutes: number }
  | { type: 'plan'; plan: readonly PlanStep[] }
  | { type: 'screen'; screen: Screen }
  | { type: 'run'; run: ExpeditionState }
  | { type: 'run-start'; session: RunSession; run: ExpeditionState }
  | { type: 'reset-run' }
  | { type: 'speed'; speed: number; at: number }
  | { type: 'settled'; settlement: Settlement; run: ExpeditionState }
  | { type: 'journal'; journal: readonly RunRecord[] }
  | { type: 'players'; players: readonly PlayerPresence[] }
  | { type: 'chat'; message: ChatMessage }

function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'ready':
      return {
        ...state,
        session: action.session,
        profile: action.session.profile,
        journal: action.journal,
        screen: 'base',
      }
    case 'failed':
      return { ...state, error: action.error }
    case 'profile':
      return { ...state, profile: action.profile }
    case 'choose-mission':
      return { ...state, mission: action.mission, plan: [], departDelay: 0, screen: 'plan' }
    case 'depart-delay':
      return { ...state, departDelay: Math.max(0, action.minutes) }
    case 'plan':
      return { ...state, plan: action.plan }
    case 'screen':
      return { ...state, screen: action.screen }
    case 'run':
      return { ...state, run: action.run }
    case 'run-start':
      return {
        ...state,
        runSession: action.session,
        run: action.run,
        screen: 'run',
        speed: SPEEDS[2],
        clock: { anchorReal: Date.now(), anchorGame: action.run.now },
      }
    case 'reset-run':
      return { ...state, run: null, runSession: null, settlement: null, mission: null, plan: [], clock: null }
    case 'speed':
      // Re-anchor on every change, so a pause holds the clock where it is and
      // resuming carries on from there rather than jumping.
      return {
        ...state,
        speed: action.speed,
        clock: { anchorReal: Date.now(), anchorGame: action.at },
      }
    case 'settled':
      return { ...state, settlement: action.settlement, run: action.run, screen: 'debrief', speed: 0 }
    case 'journal':
      return { ...state, journal: action.journal }
    case 'players':
      return { ...state, players: action.players }
    case 'chat':
      return { ...state, chat: [...state.chat, action.message].slice(-60) }
  }
}

export interface GameActions {
  chooseMission(mission: Mission): void
  setDepartDelay(minutes: number): void
  addMove(zoneCode: string): void
  addAction(actionId: string): void
  removeStep(index: number): void
  clearPlan(): void
  backToBase(): void
  depart(): void
  setSpeed(speed: number): void
  abortRun(): void
  finishDebrief(): void
  buyUpgrade(code: string): void
  restAtCamp(): void
  say(text: string): void
}

interface GameContextValue {
  state: GameState
  actions: GameActions
  /** The day's offer board. Derived, so a camp upgrade shows up on it at once. */
  missions: readonly Mission[]
  /** Live session of the run in progress — the world and explorer in play. */
  runSession: RunSession | null
}

/**
 * The board is a pure function of the day and the camp: a better room means an
 * earlier sunrise, and therefore an earlier possible departure.
 */
export function missionsFor(profile: Profile | null, shape: WorldShape | undefined): readonly Mission[] {
  if (!profile) return []

  return generateMissions(profile.day, {
    sunrise: DEFAULT_CYCLE.sunrise + sunriseShiftFrom(profile.upgrades),
    zones: shape?.zones,
  })
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, initialState)

  // Callbacks and the animation loop need the latest state without being
  // rebuilt on every tick; both only ever run after a commit.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    let cancelled = false

    openSession()
      .then(async (session) => {
        if (cancelled) return
        const journal = await session.repo.listRuns(session.identity.userId)
        if (cancelled) return

        dispatch({ type: 'ready', session, journal })
        joinMapPresence(session.identity.userId)
      })
      .catch((error: unknown) => {
        dispatch({ type: 'failed', error: error instanceof Error ? error.message : String(error) })
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => onPlayersChange((players) => dispatch({ type: 'players', players })), [])
  useEffect(() => onChat((message) => dispatch({ type: 'chat', message })), [])

  const persist = useCallback(async (profile: Profile) => {
    dispatch({ type: 'profile', profile })
    await stateRef.current.session?.repo.saveProfile(profile)
  }, [])

  // --- the clock -------------------------------------------------------
  // Game time is read off the wall clock rather than accumulated per frame:
  // browsers stop firing animation frames in a hidden tab, which would quietly
  // freeze the day — and the whole point of the day is that it runs out.
  useEffect(() => {
    if (state.screen !== 'run' || state.speed === 0 || !state.clock) return

    const { anchorReal, anchorGame } = state.clock
    const speed = state.speed

    const catchUp = () => {
      const session = stateRef.current.runSession
      const current = stateRef.current.run
      if (!session || !current || current.status === 'finished') return

      const target = anchorGame + ((Date.now() - anchorReal) / 1000) * speed
      if (target <= current.now) return

      dispatch({ type: 'run', run: advanceTo(current, target, session.ctx) })
    }

    // A hidden tab throttles this to about once a second; each wake-up simply
    // advances further, so the day stays on the wall clock either way.
    const timer = setInterval(catchUp, 100)
    document.addEventListener('visibilitychange', catchUp)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', catchUp)
    }
  }, [state.screen, state.speed, state.clock])

  // The day is over: settle it, write it down, and show the debrief.
  useEffect(() => {
    const session = state.runSession
    const profile = state.profile
    const run = state.run
    if (state.screen !== 'run' || !session || !profile) return
    if (!run || run.status !== 'finished' || !run.outcome) return
    const settlement = settleRun(run, session, profile)
    const haul = haulOf(run, session)

    const record: RunRecord = {
      day: session.day,
      missionId: session.mission.id,
      missionName: session.mission.name,
      baseZoneId: session.mission.baseZoneId,
      objectiveZoneId: session.mission.objective.zoneId,
      objectiveActionId: session.mission.objective.actionId,
      taxRate: session.mission.taxRate,
      seed: session.seed,
      departAt: session.departAt,
      arrivedAt: run.now,
      outcome: run.outcome,
      objectiveMet: settlement.bonus > 0,
      settlement,
      loot: haul.loot,
      highlights: highlightsOf(run, session),
    }

    dispatch({ type: 'settled', settlement, run })

    const next: Profile = {
      ...profile,
      credits: profile.credits + settlement.net,
      xp: profile.xp + settlement.xp,
      // A lifetime ledger of what came home — the camp's stores.
      inventory: mergeBags(profile.inventory, settlement.lootKept) as Record<string, number>,
      rested: false,
    }

    void (async () => {
      await persist(next)
      await state.session?.repo.recordRun(next, record)
      dispatch({ type: 'journal', journal: [record, ...stateRef.current.journal].slice(0, 20) })
    })()
  }, [state.screen, state.run, state.runSession, state.profile, state.session, persist])

  // --- what the map shows ----------------------------------------------
  useEffect(() => {
    const session = state.session
    if (!session) return

    const landing = state.mission?.baseZoneId ?? null
    const route = routeOf(state.plan, state.run)
    const self = selfMarker(state)

    mapBridge.setView({
      zones: session.shape.zones,
      landingZoneId: landing,
      route: landing ? [...route, landing] : route,
      leg: legOf(state.run),
      selectable: selectableZones(state),
      self,
      others: state.players.filter((player) => player.userId !== session.identity.userId),
    })
  }, [state])

  // Tell the world where we are. On a timer, not on every simulation tick:
  // the clock advances ten times a second and presence does not need that.
  useEffect(() => {
    if (!state.session) return

    const push = () => {
      const live = stateRef.current
      const session = live.session
      const self = selfMarker(live)
      if (!session || !self) return

      void trackSelf({
        userId: session.identity.userId,
        username: live.profile?.username ?? session.identity.username,
        color: session.identity.color,
        x: Math.round(self.x),
        y: Math.round(self.y),
        status: live.screen === 'run' ? 'expedition' : 'base',
        destination: live.run?.activity?.to ?? live.plan.find((step) => step.kind === 'move')?.to ?? null,
        zoneName: live.run?.zoneId ?? live.mission?.baseZoneId ?? null,
        day: live.profile?.day ?? 1,
        updatedAt: Date.now(),
      })
    }

    push()
    const timer = setInterval(push, 2000)
    return () => clearInterval(timer)
  }, [state.session])

  const actions = useMemo<GameActions>(() => {
    // During a run the authored plan has already been partly consumed: what is
    // left to edit is the simulation's own queue.
    const currentPlan = () => {
      const live = stateRef.current
      return live.screen === 'run' && live.run ? live.run.pending : live.plan
    }

    /** Mid-run edits go through `replan`, which keeps the current leg running. */
    const applyPlan = (plan: readonly PlanStep[]) => {
      const live = stateRef.current
      dispatch({ type: 'plan', plan })

      if (live.screen === 'run' && live.run && live.runSession) {
        dispatch({ type: 'run', run: replan(live.run, plan, live.runSession.ctx) })
      }
    }

    return {
      chooseMission(mission) {
        dispatch({ type: 'choose-mission', mission })
      },

      setDepartDelay(minutes) {
        dispatch({ type: 'depart-delay', minutes })
      },

      addMove(zoneCode) {
        applyPlan([...currentPlan(), { kind: 'move', to: zoneCode }])
      },

      addAction(actionId) {
        applyPlan([...currentPlan(), { kind: 'act', action: actionId }])
      },

      removeStep(index) {
        applyPlan(currentPlan().filter((_, position) => position !== index))
      },

      clearPlan() {
        applyPlan([])
      },

      backToBase() {
        dispatch({ type: 'screen', screen: 'base' })
      },

      depart() {
        const live = stateRef.current
        if (!live.mission || !live.profile) return

        const session = createRunSession({
          mission: live.mission,
          progress: {
            playerId: live.profile.playerId,
            xp: live.profile.xp,
            credits: live.profile.credits,
            upgrades: live.profile.upgrades,
            rested: live.profile.rested,
          },
          day: live.profile.day,
          departAt: live.mission.earliestDepartAt + live.departDelay,
          shape: live.session?.shape,
        })

        dispatch({
          type: 'run-start',
          session,
          run: startExpedition(session.ctx, { plan: live.plan, departAt: session.departAt }),
        })
      },

      setSpeed(speed) {
        dispatch({ type: 'speed', speed, at: stateRef.current.run?.now ?? 0 })
      },

      abortRun() {
        const live = stateRef.current
        if (!live.run || !live.runSession) return

        dispatch({ type: 'plan', plan: [] })
        dispatch({ type: 'run', run: abortToReturn(live.run, live.runSession.ctx) })
      },

      finishDebrief() {
        const live = stateRef.current
        if (!live.profile) return

        const next: Profile = { ...live.profile, day: live.profile.day + 1 }

        void persist(next)
        dispatch({ type: 'reset-run' })
        dispatch({ type: 'screen', screen: 'base' })
      },

      buyUpgrade(code) {
        const live = stateRef.current
        const profile = live.profile
        if (!profile) return

        const cost = upgradeCost(code, profile.upgrades)
        if (cost === null || cost > profile.credits) return

        void persist({
          ...profile,
          credits: profile.credits - cost,
          upgrades: { ...profile.upgrades, [code]: (profile.upgrades[code] ?? 0) + 1 },
        })
      },

      restAtCamp() {
        const profile = stateRef.current.profile
        if (!profile) return

        void persist({ ...profile, day: profile.day + 1, rested: true })
      },

      say(text) {
        const live = stateRef.current
        const session = live.session
        const trimmed = text.trim()
        if (!session || !trimmed) return

        void sendChat({
          id: crypto.randomUUID(),
          userId: session.identity.userId,
          username: live.profile?.username ?? session.identity.username,
          color: session.identity.color,
          text: trimmed.slice(0, 240),
          at: Date.now(),
        })
      },
    }
  }, [persist])

  const missions = useMemo(
    () => missionsFor(state.profile, state.session?.shape),
    [state.profile, state.session],
  )

  const value = useMemo(
    () => ({ state, actions, missions, runSession: state.runSession }),
    [state, actions, missions],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const value = useContext(GameContext)
  if (!value) throw new Error('useGame must be used inside <GameProvider>')
  return value
}

export function levelOf(profile: Profile | null): number {
  return levelFromXp(profile?.xp ?? 0)
}

export const DAY_END = MINUTES_PER_DAY

// --- view helpers -----------------------------------------------------------

/** Zone codes the plan walks through, in order. */
function routeOf(plan: readonly PlanStep[], run: ExpeditionState | null): string[] {
  const steps = run ? run.pending : plan
  const start = run?.activity?.to ?? run?.zoneId
  const route = steps.flatMap((step) => (step.kind === 'move' ? [step.to] : []))

  return start ? [start, ...route] : route
}

function legOf(run: ExpeditionState | null) {
  const activity = run?.activity
  if (!activity || activity.from === activity.to) return null

  const span = activity.endsAt - activity.startedAt
  const progress = span <= 0 ? 1 : (run!.now - activity.startedAt) / span

  return { from: activity.from, to: activity.to, progress }
}

function selfMarker(state: GameState) {
  const zones = state.session?.shape.zones ?? []
  const color = state.session?.identity.color ?? '#3b82f6'
  const label = state.profile?.username ?? ''

  const at = (code: string | null | undefined) => zones.find((zone) => zone.code === code)

  if (state.screen === 'run' && state.run) {
    const activity = state.run.activity
    if (activity && activity.from !== activity.to) {
      const from = at(activity.from)
      const to = at(activity.to)
      const span = activity.endsAt - activity.startedAt
      const progress = span <= 0 ? 1 : Math.min(1, (state.run.now - activity.startedAt) / span)

      if (from && to) {
        return {
          x: from.x + (to.x - from.x) * progress,
          y: from.y + (to.y - from.y) * progress,
          color, label, self: true,
        }
      }
    }

    const here = at(state.run.zoneId)
    if (here) return { x: here.x, y: here.y, color, label, self: true }
  }

  const base = at(state.mission?.baseZoneId ?? state.session?.shape.zones[0]?.code)
  return base ? { x: base.x, y: base.y, color, label, self: true } : null
}

/** Which zones the player may tap: anywhere but where they already stand. */
function selectableZones(state: GameState): string[] {
  if (state.screen !== 'plan' && state.screen !== 'run') return []

  const zones = state.session?.shape.zones ?? []
  const route = routeOf(state.plan, state.run)
  const last = route[route.length - 1] ?? state.mission?.baseZoneId

  return zones.map((zone) => zone.code).filter((code) => code !== last)
}

const HIGHLIGHT_LIMIT = 12

function highlightsOf(run: ExpeditionState, session: RunSession) {
  const name = (code: string) => session.world.hasZone(code) ? session.world.zone(code).name : code

  return run.log
    .flatMap((entry) => {
      switch (entry.kind) {
        case 'event':
          return [{ at: entry.at, text: `${entry.event.label} (${name(entry.zoneId)})` }]
        case 'auto-return':
          return [{ at: entry.at, text: `Retour forcé depuis ${name(entry.zoneId)} — ${entry.dropped} étape(s) abandonnée(s)` }]
        case 'finished':
          return [{ at: entry.at, text: outcomeText(entry.outcome) }]
        default:
          return []
      }
    })
    .slice(0, HIGHLIGHT_LIMIT)
}

export function outcomeText(outcome: 'on-time' | 'rescued' | 'stranded'): string {
  switch (outcome) {
    case 'on-time':
      return 'Navette prise à temps'
    case 'rescued':
      return 'Récupéré par la navette de secours'
    case 'stranded':
      return 'Resté au sol après minuit'
  }
}

export { SPEEDS }
