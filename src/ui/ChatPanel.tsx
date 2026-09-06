import { useState } from 'react'
import { useGame } from '../state/game'

/**
 * Global chat and who else is out there. Both ride the Realtime channel, so
 * they work whether or not the schema has been pushed.
 */
export function ChatPanel() {
  const { state, actions } = useGame()
  const [draft, setDraft] = useState('')

  const others = state.players.filter((player) => player.userId !== state.session?.identity.userId)

  return (
    <aside className="chat">
      <header>
        <h2>En ligne</h2>
        <span className="muted">{others.length + 1}</span>
      </header>

      <ul className="roster">
        {others.map((player) => (
          <li key={player.userId}>
            <i className="dot" style={{ background: player.color }} />
            <span>{player.username}</span>
            <em>{player.status === 'expedition' ? 'en expédition' : 'au camp'}</em>
          </li>
        ))}
        {others.length === 0 ? <li className="muted">Personne d'autre pour l'instant.</li> : null}
      </ul>

      <ul className="messages">
        {state.chat.map((message) => (
          <li key={message.id}>
            <strong style={{ color: message.color }}>{message.username}</strong>
            <span>{message.text}</span>
          </li>
        ))}
      </ul>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          actions.say(draft)
          setDraft('')
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message à tous…"
          maxLength={240}
        />
      </form>
    </aside>
  )
}
