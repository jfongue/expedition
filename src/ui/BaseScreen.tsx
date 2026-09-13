import { useMemo } from 'react'
import {
  formatClock, ITEM_VALUES, UPGRADES, bagValue, levelFromXp, levelProgress, upgradeCost,
  type Mission, type UpgradeCategory,
} from '../domain'
import { useGame } from '../state/game'
import { Bar, LootList, Panel, Stat } from './bits'

/**
 * The macro loop: pick the day's mission, or spend a day at camp turning the
 * last haul into a better explorer.
 */
const CATEGORY_LABELS: Record<UpgradeCategory, string> = {
  camp: 'Campement',
  capacity: 'Capacités',
  knowledge: 'Connaissances',
}

export function BaseScreen() {
  const { state, actions, missions } = useGame()
  const profile = state.profile
  if (!profile) return null

  const stored = bagValue(profile.inventory, ITEM_VALUES)
  // Only one elevator is open for now; the rest unlock later through upgrades.
  const mission = missions[0]

  return (
    <div className="screen">
      <Panel title="Mission">
        {mission ? (
          <div className="missions">
            <MissionCard mission={mission} onPick={() => actions.chooseMission(mission)} />
          </div>
        ) : null}
        <p className="hint">D’autres ascenseurs se débloqueront avec des améliorations.</p>
        <button type="button" className="secondary wide" onClick={actions.restAtCamp}>
          Rester au camp un jour de plus
          <em>Aucun revenu, mais la prochaine journée est plus rapide et mieux estimée</em>
        </button>
      </Panel>

      <Panel title="Améliorations" aside={<span className="muted">{profile.credits} crédits</span>}>
        {(Object.keys(CATEGORY_LABELS) as UpgradeCategory[]).map((category) => (
          <div key={category} className="upgrade-group">
            <h3>{CATEGORY_LABELS[category]}</h3>
            {UPGRADES.filter((upgrade) => upgrade.category === category).map((upgrade) => {
              const level = profile.upgrades[upgrade.code] ?? 0
              const cost = upgradeCost(upgrade.code, profile.upgrades)
              const affordable = cost !== null && cost <= profile.credits

              return (
                <div key={upgrade.code} className="upgrade">
                  <div className="upgrade-text">
                    <strong>
                      {upgrade.name}
                      <span className="level">
                        {level}/{upgrade.maxLevel}
                      </span>
                    </strong>
                    <span className="muted">{upgrade.effect}</span>
                  </div>
                  <button
                    type="button"
                    className="chip"
                    disabled={!affordable}
                    onClick={() => actions.buyUpgrade(upgrade.code)}
                  >
                    {cost === null ? 'Max' : `${cost} cr`}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </Panel>

      <Panel title="Camp" aside={<span className="muted">{stored} cr de matière rapportée</span>}>
        <div className="stats">
          <Stat label="Niveau" value={levelFromXp(profile.xp)} hint={`${profile.xp} xp`} />
          <Stat label="Crédits" value={profile.credits} />
          <Stat label="Expéditions" value={state.journal.length} />
        </div>
        <Bar value={levelProgress(profile.xp)} />
        <h3>Réserves cumulées</h3>
        <LootList loot={profile.inventory} />
      </Panel>

      <Journal />
    </div>
  )
}

function MissionCard({ mission, onPick }: { mission: Mission; onPick: () => void }) {
  return (
    <button type="button" className="mission" onClick={onPick}>
      <strong>{mission.name}</strong>
      <span className="mission-objective">{mission.objective.label}</span>
      <span className="mission-meta">
        <em>Départ {formatClock(mission.earliestDepartAt)}</em>
        <em>Taxe {mission.taxRate}%</em>
        <em>Prime {mission.bonusCredits} cr</em>
        <em>Danger {'▲'.repeat(mission.danger)}</em>
      </span>
    </button>
  )
}

function Journal() {
  const { state } = useGame()
  const runs = useMemo(() => state.journal.slice(0, 8), [state.journal])

  if (runs.length === 0) return null

  return (
    <Panel title="Journal">
      <ul className="journal">
        {runs.map((run, index) => (
          <li key={`${run.day}-${run.missionId}-${index}`}>
            <span className="journal-day">J{run.day}</span>
            <span className="journal-name">{run.missionName}</span>
            <span className={`journal-outcome outcome-${run.outcome}`}>
              {run.outcome === 'on-time' ? 'à temps' : run.outcome === 'rescued' ? 'secours' : 'perdu'}
            </span>
            <strong>+{run.settlement.net} cr</strong>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
