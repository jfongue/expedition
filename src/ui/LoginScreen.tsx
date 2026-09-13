import { useMemo, useState } from 'react'
import { useGame } from '../state/game'
import { knownNames, lastName } from '../lib/profileNames'

/**
 * Just a first name, no password, no restriction — kept on this device so a
 * returning player can pick themselves back out of a dropdown after two
 * letters instead of having to spell it exactly the same way again.
 */
export function LoginScreen() {
  const { actions } = useGame()
  const [value, setValue] = useState(() => lastName())
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)

  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase()
    if (query.length < 2) return []
    return knownNames().filter((name) => name.toLowerCase() !== query && name.toLowerCase().includes(query))
  }, [value])

  const submit = (name: string) => {
    if (!name.trim()) return
    actions.enterName(name)
  }

  return (
    <main className="app">
      <div className="login">
        <h1>Expedition</h1>
        <p className="muted">Comment doit-on t’appeler ?</p>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit(value)
          }}
        >
          <div className="login-field">
            <input
              autoFocus
              value={value}
              placeholder="Ton prénom d’expéditeur"
              maxLength={24}
              onChange={(event) => {
                setValue(event.target.value)
                setSuggestionsOpen(true)
              }}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => setTimeout(() => setSuggestionsOpen(false), 120)}
            />
            {suggestionsOpen && suggestions.length > 0 ? (
              <ul className="login-suggestions">
                {suggestions.map((name) => (
                  <li key={name}>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => submit(name)}>
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <button type="submit" className="primary wide" disabled={!value.trim()}>
            Embarquer
          </button>
        </form>
      </div>
    </main>
  )
}
