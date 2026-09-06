import { formatClock, levelFromXp } from '../domain'
import { outcomeText, useGame } from '../state/game'
import { LootList, Panel, Stat } from './bits'

/**
 * The end of the day: what came home, what the base took, and what is left to
 * invest. Closing the debrief is what advances the calendar.
 */
export function DebriefScreen() {
  const { state, actions } = useGame()
  const { settlement, run, profile } = state
  if (!settlement || !run || !profile) return null

  const levelBefore = levelFromXp(profile.xp - settlement.xp)
  const levelAfter = levelFromXp(profile.xp)

  return (
    <div className="screen">
      <Panel title="Retour" aside={<span className="muted">arrivée {formatClock(run.now)}</span>}>
        <p className={`outcome outcome-${settlement.outcome}`}>{outcomeText(settlement.outcome)}</p>

        <div className="stats">
          <Stat label="Butin brut" value={`${settlement.gross} cr`} />
          <Stat label="Taxe" value={`−${settlement.tax} cr`} />
          {settlement.rescueFee > 0 ? <Stat label="Navette de secours" value={`−${settlement.rescueFee} cr`} /> : null}
          {settlement.bonus > 0 ? <Stat label="Prime d'objectif" value={`+${settlement.bonus} cr`} /> : null}
          <Stat label="Net" value={`+${settlement.net} cr`} />
          <Stat
            label="Expérience"
            value={`+${settlement.xp} xp`}
            hint={levelAfter > levelBefore ? `niveau ${levelAfter} !` : undefined}
          />
        </div>

        <h3>Rapporté</h3>
        <LootList loot={settlement.lootKept} />

        <button type="button" className="primary wide" onClick={actions.finishDebrief}>
          Remonter au camp — jour {profile.day + 1}
        </button>
      </Panel>
    </div>
  )
}
