import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

export interface PlayerPresence {
  userId: string
  color: string
  x: number
  y: number
  updatedAt: number
}

type PlayersListener = (players: PlayerPresence[]) => void

const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316']

// The channel is a page-level singleton: supabase-js caches channels by topic,
// so tying its lifecycle to a React/Phaser component that remounts would try to
// re-register handlers on an already-subscribed channel.
let channel: RealtimeChannel | undefined
const listeners = new Set<PlayersListener>()

let identityPromise: Promise<{ userId: string; color: string }> | undefined

async function resolveIdentity() {
  let userId: string | undefined
  try {
    // Reuse the stored session: signInAnonymously() always mints a brand new
    // anonymous user, which would inflate auth.users on every page load.
    const { data: existing } = await supabase.auth.getSession()
    userId = existing.session?.user.id

    if (!userId) {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (!error) userId = data.user?.id
    }
  } catch {
    // Anonymous sign-in is not enabled on the project yet.
  }

  const id = userId ?? crypto.randomUUID()
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0

  return {
    userId: id,
    color: PLAYER_COLORS[Math.abs(hash) % PLAYER_COLORS.length],
  }
}

// Identity is resolved once per tab so the presence key and the tracked
// payload always agree, even across a StrictMode remount.
export function getIdentity() {
  identityPromise ??= resolveIdentity()
  return identityPromise
}

function emit() {
  const state = channel?.presenceState<PlayerPresence>() ?? {}

  // A reload leaves the previous connection registered under the same key until
  // the server times it out, so keep only each player's freshest position.
  const freshest = new Map<string, PlayerPresence>()
  for (const entries of Object.values(state)) {
    for (const entry of entries) {
      const known = freshest.get(entry.userId)
      if (!known || entry.updatedAt > known.updatedAt) freshest.set(entry.userId, entry)
    }
  }

  const players = [...freshest.values()]
  for (const listener of listeners) listener(players)
}

export function joinMapPresence(userId: string) {
  if (channel) return

  channel = supabase.channel('map-presence', {
    config: { presence: { key: userId } },
  })

  channel
    .on('presence', { event: 'sync' }, emit)
    .on('presence', { event: 'join' }, emit)
    .on('presence', { event: 'leave' }, emit)
    .subscribe()

  // Without this the server keeps the old connection alive for a while after a
  // reload, so the player shows up twice in the presence state.
  window.addEventListener('pagehide', () => {
    if (channel) supabase.removeChannel(channel)
  })
}

export function onPlayersChange(listener: PlayersListener) {
  listeners.add(listener)
  emit()
  return () => listeners.delete(listener)
}

export async function trackPosition(player: PlayerPresence) {
  await channel?.track(player)
}
