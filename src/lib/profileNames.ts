/**
 * The names typed at the login screen, remembered on this device only — no
 * account, no password. Lets a returning player pick their name back out of a
 * dropdown instead of retyping it exactly.
 */
const KNOWN_KEY = 'expedition:known-names'
const MAX_KNOWN = 8

export function knownNames(): string[] {
  try {
    const raw = localStorage.getItem(KNOWN_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function rememberName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return

  try {
    const rest = knownNames().filter((known) => known.toLowerCase() !== trimmed.toLowerCase())
    localStorage.setItem(KNOWN_KEY, JSON.stringify([trimmed, ...rest].slice(0, MAX_KNOWN)))
  } catch {
    // Private browsing or no storage: the name still works this session.
  }
}

export function lastName(): string {
  return knownNames()[0] ?? ''
}
