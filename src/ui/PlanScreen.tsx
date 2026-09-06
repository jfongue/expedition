import { useMemo } from 'react'
import { createRunSession, formatClock, formatDuration, MINUTES_PER_HOUR } from '../domain'
import { useGame } from '../state/game'
import {
  ActionPicker, Problems, ScheduleSummary, StepList, usePlanSchedule, useZoneTap,
} from './PlanEditor'
import { Panel } from './bits'

const DELAY_CHOICES = [0, MINUTES_PER_HOUR, 2 * MINUTES_PER_HOUR, 4 * MINUTES_PER_HOUR]

/**
 * The micro loop, before departure: chain moves and actions while the schedule
 * still gets you back to the elevator. Tapping the map adds a leg.
 */
export function PlanScreen() {
  const { state, actions } = useGame()
  const { mission, profile } = state

  useZoneTap(true)

  const session = useMemo(() => {
    if (!mission || !profile) return null

    return createRunSession({
      mission,
      progress: {
        playerId: profile.playerId, xp: profile.xp, credits: profile.credits,
        upgrades: profile.upgrades, rested: profile.rested,
      },
      day: profile.day,
      departAt: mission.earliestDepartAt + state.departDelay,
      shape: state.session?.shape,
    })
  }, [mission, profile, state.departDelay, state.session])

  const schedule = usePlanSchedule(
    state.plan,
    mission && session ? { session, from: mission.baseZoneId, departAt: session.departAt } : null,
  )

  if (!mission || !session || !schedule) return null

  // Where the plan leaves the explorer standing — the zone whose actions are on offer.
  const endZone = state.plan.reduce(
    (zone, step) => (step.kind === 'move' ? step.to : zone),
    mission.baseZoneId,
  )

  return (
    <div className="screen">
      <Panel
        title="Planning"
        aside={
          <button type="button" className="ghost" onClick={actions.backToBase}>
            Changer de mission
          </button>
        }
      >
        <p className="mission-line">
          <strong>{mission.name}</strong>
          <span className="muted">
            {mission.objective.label} — prime {mission.bonusCredits} cr, taxe {mission.taxRate}%
          </span>
        </p>

        <div className="depart">
          <span className="stat-label">Départ</span>
          <div className="chips">
            {DELAY_CHOICES.map((delay) => (
              <button
                key={delay}
                type="button"
                className={state.departDelay === delay ? 'chip chip-on' : 'chip'}
                onClick={() => actions.setDepartDelay(delay)}
              >
                {formatClock(mission.earliestDepartAt + delay)}
                {delay > 0 ? <em>+{formatDuration(delay)}</em> : <em>lever du soleil</em>}
              </button>
            ))}
          </div>
        </div>

        <p className="hint">
          Touchez une zone sur la carte pour ajouter un déplacement, puis choisissez une action sur place.
        </p>

        <StepList schedule={schedule} session={session} editable onRemove={actions.removeStep} />
        <ActionPicker session={session} zoneCode={endZone} onPick={actions.addAction} />
        <ScheduleSummary schedule={schedule} />
        <Problems schedule={schedule} session={session} />

        <div className="row">
          <button type="button" className="secondary" onClick={actions.clearPlan} disabled={state.plan.length === 0}>
            Vider
          </button>
          <button type="button" className="primary" onClick={actions.depart} disabled={!schedule.fits}>
            Descendre — {formatClock(session.departAt)}
          </button>
        </div>
      </Panel>
    </div>
  )
}
