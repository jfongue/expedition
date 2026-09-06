import { PhaserGame } from './game/PhaserGame'
import './App.css'

function App() {
  return (
    <main className="app">
      <header className="app-header">
        <h1>Expedition</h1>
        <p>Territoire inexploré — molette ou pincement pour zoomer, glisser pour déplacer la carte.</p>
      </header>
      <PhaserGame />
    </main>
  )
}

export default App
