import { GameProvider } from './state/game'
import { GameShell } from './ui/GameShell'
import './App.css'

export default function App() {
  return (
    <GameProvider>
      <GameShell />
    </GameProvider>
  )
}
