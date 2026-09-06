import { useMemo } from 'react'
import {
  formatClock, formatDuration, haulOf, ITEM_VALUES, bagValue, phaseAt, pointOfNoReturn,
  slackRemaining, type ExpeditionState, type LogEntry, type RunSession,
} from '../domain'
import { SPEED_LABELS, SPEEDS, useGame } from '../state/game'
import {
  ActionPicker, Problems, ScheduleSummary, StepList, describe, usePlanSchedule, useZoneTap,
} from './PlanEditor'
import { Bar, LootList, Panel, Slack } from './bits'

const PHASE_LABELS = {
  'before-sunrise': 'avant le jour',
  day: 'plein jour',
  dusk: 'crépuscule',
  night: 'nuit',
} as const

/**
 * The micro loop, live. The clock runs, the estimates were only estimates, and
 * the plan can be rewritten right up to the moment the return kicks in.
 */
export function RunScreen() {
  const { state, actions, runSession } = useGame()
  const run = state.run

  useZoneTap(true)

  const schedule = usePlanSchedule(
    run?.pending ?? [],
    run && runSession
      ? {
          session: runSession,
          from: run.activity ? run.activity.to : run.zoneId,
          departAt: run.activity ? run.activity.startedAt + run.activity.estimate.expected : run.now,
          unlocked: run.unlocked,
        }
      : null,
  )

  const haul = useMemo(
    () => (run && runSession ? haulOf(run, runSession) : null),
    [run, runSession],
  )

  if (!run || !runSession || !schedule || !haul) return null

  const { world } = runSession
  const slack = slackRemaining(run, runSession.ctx)
  const noReturn = pointOfNoReturn(world, runSession.explorer, run.zoneId, run.now)
  const phase = phaseAt(world.cycle, run.now)
  const zoneName = (code: string) => (world.hasZone(code) ? world.zone(code).name : code)

  return (
    <div className="screen">
      <Panel
        title="En expédition"
        aside={
          <div className="chips">
            {SPEEDS.map((speed, index) => (
              <button
                key={speed}
                type="button"
                className={state.speed === speed ? 'chip chip-on' : 'chip'}
                onClick={() => actions.setSpeed(speed)}
              >
                {SPEED_LABELS[index]}
              </button>
            ))}
          </div>
        }
      >
        <div className="clock">
          <strong>{formatClock(run.now)}</strong>
          <span className="muted">{PHASE_LABELS[phase]}</span>
          <span className="muted">
            Point de non-retour <strong>{formatClock(noReturn)}</strong>
          </span>
        </div>

        <Activity run={run} session={runSession} />

        <div className="summary">
          <span>
            Position <strong>{zoneName(run.zoneId)}</strong>
          </span>
          <span>
            Marge <Slack minutes={slack} />
          </span>
          <span>
            Butin <strong>{bagValue(haul.loot, ITEM_VALUES)} cr</strong>
          </span>
        </div>

        {run.autoReturn ? (
          <p className="alert">
            Le temps a manqué : le retour s'est enclenché automatiquement, le reste du planning est abandonné.
          </p>
        ) : null}
      </Panel>

      <Panel title="Suite du planning">
        <StepList schedule={schedule} session={runSession} editable={!run.autoReturn} onRemove={actions.removeStep} />
        {run.status === 'returning' ? (
          <p className="muted">Retour en cours. Toute nouvelle étape repartira depuis l'ascenseur.</p>
        ) : (
          <ActionPicker
            session={runSession}
            zoneCode={endZoneOf(run)}
            unlocked={run.unlocked.get(endZoneOf(run))}
            onPick={actions.addAction}
          />
        )}
        <ScheduleSummary schedule={schedule} />
        <Problems schedule={schedule} session={runSession} />
        <div className="row">
          <button type="button" className="secondary" onClick={actions.clearPlan} disabled={run.pending.length === 0}>
            Vider la suite
          </button>
          <button
            type="button"
            className="primary"
            onClick={actions.abortRun}
            disabled={run.status === 'returning' || run.status === 'finished'}
          >
            Rentrer maintenant
          </button>
        </div>
      </Panel>

      <Panel title="Butin en cours" aside={<span className="muted">{haul.xp} xp</span>}>
        <LootList loot={haul.loot} />
      </Panel>

      <Panel title="Journal de bord">
        <ul className="log">
          {[...run.log].reverse().slice(0, 40).map((entry, index) => (
            <li key={index}>
              <span className="log-clock">{formatClock(entry.at)}</span>
              <span>{logText(entry, runSession)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

/** Where the queue leaves the explorer standing — whose actions are on offer. */
function endZoneOf(run: ExpeditionState): string {
  return run.pending.reduce(
    (zone, step) => (step.kind === 'move' ? step.to : zone),
    run.activity ? run.activity.to : run.zoneId,
  )
}

/** The step under way, with the progress the explorer can actually perceive. */
function Activity({ run, session }: { run: ExpeditionState; session: RunSession }) {
  const activity = run.activity
  if (!activity) {
    return <p className="muted">Journée terminée.</p>
  }

  // Progress against the *estimate*, not the real duration: overrunning the
  // estimate is exactly the information the player is meant to feel.
  const expected = Math.max(1, activity.estimate.expected)
  const elapsed = run.now - activity.startedAt
  const overrun = elapsed > expected

  return (
    <div className="activity">
      <strong>
        {describe(
          {
            index: -1, step: activity.step, from: activity.from, to: activity.to,
            estimate: activity.estimate, startAt: activity.startedAt,
            endAt: activity.startedAt + activity.estimate.expected,
            worstCaseEndAt: activity.startedAt + activity.estimate.worstCase,
          },
          session,
        )}
      </strong>
      <Bar value={elapsed / expected} tone={overrun ? 'warn' : 'ink'} />
      <span className="muted">
        {overrun
          ? `${formatDuration(elapsed - expected)} de plus que prévu`
          : `reste environ ${formatDuration(expected - elapsed)}`}
        {' · estimé '}
        {formatDuration(activity.estimate.expected)} ±{Math.round(activity.estimate.uncertainty * 100)}%
      </span>
    </div>
  )
}

function logText(entry: LogEntry, session: RunSession): string {
  const zone = (code: string) => (session.world.hasZone(code) ? session.world.zone(code).name : code)
  const action = (code: string) => (session.world.hasAction(code) ? session.world.action(code).name : code)

  switch (entry.kind) {
    case 'depart':
      return `Descente à ${zone(entry.zoneId)}`
    case 'arrive':
      return `Arrivée à ${zone(entry.zoneId)}`
    case 'action-start':
      return `${action(entry.actionId)} — début`
    case 'action-done':
      return `${action(entry.actionId)} — terminé`
    case 'step-skipped':
      return `Étape impossible à ${zone(entry.zoneId)}, ignorée`
    case 'event':
      return entry.event.label
    case 'auto-return':
      return `Retour forcé (${entry.dropped} étape(s) abandonnée(s))`
    case 'return-start':
      return `Départ du retour depuis ${zone(entry.zoneId)}`
    case 'replan':
      return `Planning modifié (${entry.steps} étape(s))`
    case 'finished':
      return `Journée terminée — ${entry.outcome}`
  }
}
