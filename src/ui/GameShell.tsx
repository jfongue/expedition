import { formatClock, levelFromXp, levelProgress } from '../domain'
import { PhaserGame } from '../game/PhaserGame'
import { useGame } from '../state/game'
import { BaseScreen } from './BaseScreen'
import { ChatPanel } from './ChatPanel'
import { DebriefScreen } from './DebriefScreen'
import { LoginScreen } from './LoginScreen'
import { PlanScreen } from './PlanScreen'
import { RunScreen } from './RunScreen'
import { SplashScreen } from './SplashScreen'
import { Bar } from './bits'

/** The frame: the continent on the left, the day's business on the right. */
export function GameShell() {
  const { state } = useGame()

  if (state.error) {
    return (
      <main className="app">
        <div className="boot">
          <h1>Expedition</h1>
          <p className="alert">{state.error}</p>
        </div>
      </main>
    )
  }

  if (state.screen === 'splash') return <SplashScreen />
  if (state.screen === 'login') return <LoginScreen />

  return (
    <main className="app">
      <Header />
      <div className="body">
        <div className="map-canvas-wrap">
          <PhaserGame />
          <ChatPanel />
        </div>
        <div className="side">
          {state.screen === 'loading' ? <p className="muted boot-line">Connexion au vaisseau…</p> : null}
          {state.screen === 'base' ? <BaseScreen /> : null}
          {state.screen === 'plan' ? <PlanScreen /> : null}
          {state.screen === 'run' ? <RunScreen /> : null}
          {state.screen === 'debrief' ? <DebriefScreen /> : null}
        </div>
      </div>
    </main>
  )
}

function Header() {
  const { state } = useGame()
  const { profile, run } = state

  return (
    <header className="app-header">
      <div>
        <h1>Expedition</h1>
        <p>
          {profile ? profile.username : 'Chargement…'}
          {run ? ` · ${formatClock(run.now)}` : ''}
          {profile?.rested ? ' · reposé' : ''}
        </p>
      </div>

      {profile ? (
        <div className="header-stats">
          <span>
            <em>Niveau</em>
            <strong>{levelFromXp(profile.xp)}</strong>
            <Bar value={levelProgress(profile.xp)} />
          </span>
          <span>
            <em>Crédits</em>
            <strong>{profile.credits}</strong>
          </span>
        </div>
      ) : null}
    </header>
  )
}
