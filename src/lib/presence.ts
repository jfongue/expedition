import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

export interface PlayerPresence {
  userId: string
  color: string
  x: number
  y: number
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
    const { data, error } = await supabase.auth.signInAnonymously()
    if (!error) userId = data.user?.id
  } catch {
    // Anonymous sign-in is not enabled on the project yet.
  }

  return {
    userId: userId ?? crypto.randomUUID(),
    color: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)],
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
  const players = Object.values(state)
    .map((entries) => entries[entries.length - 1])
    .filter(Boolean)

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
}

export function onPlayersChange(listener: PlayersListener) {
  listeners.add(listener)
  emit()
  return () => listeners.delete(listener)
}

export async function trackPosition(player: PlayerPresence) {
  await channel?.track(player)
}
