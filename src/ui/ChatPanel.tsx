import { useEffect, useRef, useState } from 'react'
import { useGame } from '../state/game'

type View = 'closed' | 'compact' | 'full'

const COMPACT_MESSAGES = 3

/**
 * Global chat and who else is out there. Both ride the Realtime channel, so
 * they work whether or not the schema has been pushed. Stays docked as a
 * closed toggle until opened; opening shows the last few messages, and
 * expanding to full takes over the whole screen for the complete history.
 */
export function ChatPanel() {
  const { state, actions } = useGame()
  const [draft, setDraft] = useState('')
  const [view, setView] = useState<View>('closed')
  const [unread, setUnread] = useState(0)
  const seen = useRef(state.chat.length)

  useEffect(() => {
    const grew = state.chat.length - seen.current
    seen.current = state.chat.length
    if (grew > 0 && view === 'closed') setUnread((count) => count + grew)
  }, [state.chat.length, view])

  if (view === 'closed') {
    return (
      <button
        type="button"
        className="chat-toggle"
        onClick={() => {
          setView('compact')
          setUnread(0)
        }}
      >
        Chat
        {unread > 0 ? <em>{unread}</em> : null}
      </button>
    )
  }

  const others = state.players.filter((player) => player.userId !== state.session?.identity.userId)
  const visible = view === 'full' ? state.chat : state.chat.slice(-COMPACT_MESSAGES)

  return (
    <aside className={view === 'full' ? 'chat chat-full' : 'chat'}>
      <header>
        <h2>En ligne</h2>
        <div className="chat-head-right">
          <span className="muted">{others.length + 1}</span>
          <button type="button" className="ghost" onClick={() => setView(view === 'full' ? 'compact' : 'full')}>
            {view === 'full' ? 'Réduire' : 'Agrandir'}
          </button>
          <button type="button" className="ghost" onClick={() => setView('closed')}>
            Fermer
          </button>
        </div>
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
        {visible.map((message) => (
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
