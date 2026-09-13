import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

/**
 * The live layer: who else is on the map, where they are, and what they are
 * doing. Presence needs no table — it rides on a Realtime channel — so it
 * works even before the schema is pushed to the project. Chat rides the same
 * channel as a broadcast.
 */
export interface PlayerPresence {
  userId: string
  username: string
  color: string
  x: number
  y: number
  /** 'base' aboard the ship, 'expedition' down on the continent. */
  status: 'base' | 'expedition'
  /** Where they are heading, when they are on the ground — visible to everyone. */
  destination?: string | null
  zoneName?: string | null
  day: number
  updatedAt: number
}

export interface ChatMessage {
  id: string
  userId: string
  username: string
  color: string
  text: string
  at: number
}

type PlayersListener = (players: PlayerPresence[]) => void
type ChatListener = (message: ChatMessage) => void

const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316']

// The channel is a page-level singleton: supabase-js caches channels by topic,
// so tying its lifecycle to a React/Phaser component that remounts would try to
// re-register handlers on an already-subscribed channel.
let channel: RealtimeChannel | undefined
const listeners = new Set<PlayersListener>()
const chatListeners = new Set<ChatListener>()

export interface Identity {
  userId: string
  username: string
  color: string
  /** False when anonymous sign-in is unavailable and the id is local only. */
  authenticated: boolean
}

let identityPromise: Promise<Identity> | undefined

async function resolveIdentity(chosenName?: string): Promise<Identity> {
  let userId: string | undefined
  let authenticated = false

  try {
    // Reuse the stored session: signInAnonymously() always mints a brand new
    // anonymous user, which would inflate auth.users on every page load.
    const { data: existing } = await supabase.auth.getSession()
    userId = existing.session?.user.id

    if (!userId) {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (!error) userId = data.user?.id
    }
    authenticated = Boolean(userId)
  } catch {
    // Anonymous sign-in is not enabled on the project yet.
  }

  const id = userId ?? localId()
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0

  return {
    userId: id,
    username: chosenName?.trim() || `Explorateur-${id.replace(/-/g, '').slice(0, 6)}`,
    color: PLAYER_COLORS[Math.abs(hash) % PLAYER_COLORS.length],
    authenticated,
  }
}

/** A stable id per browser, so a local-only player keeps their camp. */
function localId(): string {
  const key = 'expedition:local-id'
  try {
    const stored = localStorage.getItem(key)
    if (stored) return stored
    const minted = crypto.randomUUID()
    localStorage.setItem(key, minted)
    return minted
  } catch {
    return crypto.randomUUID()
  }
}

// Identity is resolved once per tab so the presence key and the tracked
// payload always agree, even across a StrictMode remount.
export function getIdentity(chosenName?: string) {
  identityPromise ??= resolveIdentity(chosenName)
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
    .on('broadcast', { event: 'chat' }, ({ payload }) => {
      const message = payload as ChatMessage
      for (const listener of chatListeners) listener(message)
    })
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
  return () => {
    listeners.delete(listener)
  }
}

export function onChat(listener: ChatListener) {
  chatListeners.add(listener)
  return () => {
    chatListeners.delete(listener)
  }
}

export async function trackSelf(player: PlayerPresence) {
  await channel?.track(player)
}

export async function sendChat(message: ChatMessage) {
  await channel?.send({ type: 'broadcast', event: 'chat', payload: message })
  // Broadcast does not echo to the sender, so surface it locally.
  for (const listener of chatListeners) listener(message)
}
