import type { ReactNode } from 'react'
import { formatDuration, ITEMS } from '../domain'

/** Small presentational pieces shared by the screens. */

export function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  )
}

export function Bar({ value, tone = 'ink' }: { value: number; tone?: 'ink' | 'warn' | 'bad' }) {
  const width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`
  return (
    <div className="bar">
      <div className={`bar-fill bar-${tone}`} style={{ width }} />
    </div>
  )
}

const ITEM_NAMES: Record<string, string> = Object.fromEntries(ITEMS.map((item) => [item.code, item.name]))

export function itemName(code: string): string {
  return ITEM_NAMES[code] ?? code
}

export function LootList({ loot }: { loot: Readonly<Record<string, number>> }) {
  const entries = Object.entries(loot).filter(([, quantity]) => quantity > 0)
  if (entries.length === 0) return <p className="muted">Rien rapporté.</p>

  return (
    <ul className="loot">
      {entries
        .sort((a, b) => b[1] - a[1])
        .map(([code, quantity]) => (
          <li key={code}>
            <span>{itemName(code)}</span>
            <strong>×{quantity}</strong>
          </li>
        ))}
    </ul>
  )
}

/** A slack readout: how much room is left before the return has to start. */
export function Slack({ minutes }: { minutes: number }) {
  const tone = minutes < 0 ? 'bad' : minutes < 60 ? 'warn' : 'ok'
  const text = minutes < 0 ? `en retard de ${formatDuration(-minutes)}` : formatDuration(minutes)

  return <strong className={`slack slack-${tone}`}>{text}</strong>
}
