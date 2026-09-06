import { PhaserGame } from './game/PhaserGame'
import './App.css'

function App() {
  return (
    <section id="center">
      <h1>Expedition</h1>
      <p>Clique sur une case pour déplacer ton pion. Ouvre plusieurs onglets pour voir les autres joueurs en direct.</p>
      <PhaserGame />
    </section>
  )
}

export default App
