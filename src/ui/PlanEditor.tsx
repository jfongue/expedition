import { useEffect, useMemo } from 'react'
import {
  formatClock, formatDuration, schedulePlan, type PlanStep, type RunSession, type Schedule,
  type ScheduledStep,
} from '../domain'
import { mapBridge } from '../game/mapBridge'
import { useGame } from '../state/game'
import { Slack } from './bits'

/**
 * The planning surface, shared by the pre-departure screen and the live run:
 * a tappable map (wired through the bridge), the chained steps with their
 * estimates, and whatever the current zone offers.
 */
export function useZoneTap(enabled: boolean) {
  const { actions } = useGame()

  useEffect(() => {
    if (!enabled) return
    return mapBridge.onZoneClick((zoneCode) => actions.addMove(zoneCode))
  }, [enabled, actions])
}

export interface PlanContext {
  session: RunSession
  /** Where the plan starts from — the elevator, or where the explorer stands. */
  from: string
  departAt: number
  unlocked?: ReadonlyMap<string, ReadonlySet<string>>
}

/** Null-tolerant so screens can call it before their session exists. */
export function usePlanSchedule(
  plan: readonly PlanStep[],
  context: PlanContext | null,
): Schedule | null {
  return useMemo(() => {
    if (!context) return null
    const { session, from, departAt, unlocked } = context
    return schedulePlan(session.world, session.explorer, plan, { departAt, from, unlocked })
  }, [context, plan])
}

export function StepList({
  schedule, session, onRemove, editable,
}: {
  schedule: Schedule
  session: RunSession
  onRemove?: (index: number) => void
  editable: boolean
}) {
  return (
    <ol className="steps">
      {schedule.steps.map((step) => (
        <li key={`${step.index}-${step.startAt}`} className={step.step.kind === 'return' ? 'step step-return' : 'step'}>
          <span className="step-clock">{formatClock(step.startAt)}</span>
          <span className="step-label">{describe(step, session)}</span>
          <span className="step-cost">
            {formatDuration(step.estimate.expected)}
            <em>±{Math.round(step.estimate.uncertainty * 100)}%</em>
          </span>
          {editable && onRemove && step.index >= 0 ? (
            <button type="button" className="ghost" onClick={() => onRemove(step.index)} aria-label="Retirer">
              ×
            </button>
          ) : (
            <span className="step-spacer" />
          )}
        </li>
      ))}
    </ol>
  )
}

export function describe(step: ScheduledStep, session: RunSession): string {
  const zoneName = (code: string) => (session.world.hasZone(code) ? session.world.zone(code).name : code)

  switch (step.step.kind) {
    case 'move':
      return `Marcher vers ${zoneName(step.step.to)}`
    case 'act':
      return `${session.world.action(step.step.action).name} — ${zoneName(step.from)}`
    case 'return':
      return `Retour à ${zoneName(step.step.to)}`
  }
}

export function ActionPicker({
  session, zoneCode, unlocked, onPick,
}: {
  session: RunSession
  zoneCode: string
  unlocked?: ReadonlySet<string>
  onPick: (actionId: string) => void
}) {
  const zone = session.world.hasZone(zoneCode) ? session.world.zone(zoneCode) : null
  if (!zone) return null

  const available = [...new Set([...zone.actions, ...(unlocked ?? [])])]

  return (
    <div className="actions-here">
      <p className="muted">
        À {zone.name} {available.length === 0 ? '— rien à faire ici.' : ''}
      </p>
      <div className="chips">
        {available.map((actionId) => {
          const action = session.world.action(actionId)
          return (
            <button key={actionId} type="button" className="chip" onClick={() => onPick(actionId)}>
              {action.name}
              <em>{formatDuration(action.duration)}</em>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ScheduleSummary({ schedule }: { schedule: Schedule }) {
  return (
    <div className="summary">
      <span>
        Retour prévu <strong>{formatClock(schedule.arrivalAt)}</strong>
      </span>
      <span>
        Au pire <strong>{formatClock(schedule.worstCaseArrivalAt)}</strong>
      </span>
      <span>
        Marge <Slack minutes={schedule.slack} />
      </span>
    </div>
  )
}

export function Problems({ schedule, session }: { schedule: Schedule; session: RunSession }) {
  if (schedule.problems.length === 0) return null

  return (
    <ul className="problems">
      {schedule.problems.map((problem, index) => (
        <li key={index}>{problemText(problem, session)}</li>
      ))}
    </ul>
  )
}

function problemText(problem: Schedule['problems'][number], session: RunSession): string {
  switch (problem.kind) {
    case 'no-time':
      return `Le planning déborde de ${formatDuration(problem.overshoot)} : la navette serait manquée.`
    case 'action-unavailable':
      return `${session.world.action(problem.actionId).name} n'est pas possible à ${session.world.zone(problem.zoneId).name}.`
    case 'redundant-move':
      return `Vous êtes déjà à ${session.world.zone(problem.zoneId).name}.`
    case 'unknown-zone':
      return `Zone inconnue : ${problem.zoneId}.`
    case 'unknown-action':
      return `Action inconnue : ${problem.actionId}.`
  }
}
