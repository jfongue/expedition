import { CONTINENT, type WorldShape } from '../domain'
import { getIdentity, type Identity } from './presence'
import { createLocalRepo, type Profile, type Repo } from './repo'
import { createSupabaseRepo, probeSupabase } from './supabaseRepo'

/**
 * Boot: who am I, where is my camp stored, and what does the world look like.
 * Resolved once and shared, so React and Phaser see the same session.
 */
export interface Session {
  identity: Identity
  repo: Repo
  profile: Profile
  shape: WorldShape
}

let sessionPromise: Promise<Session> | undefined

export function openSession(): Promise<Session> {
  sessionPromise ??= resolve()
  return sessionPromise
}

async function resolve(): Promise<Session> {
  const identity = await getIdentity()
  const seed = { playerId: identity.userId, username: identity.username, color: identity.color }

  const blocker = identity.authenticated
    ? await probeSupabase()
    : 'Connexion anonyme indisponible sur le projet Supabase.'

  const repo = blocker ? createLocalRepo(blocker) : createSupabaseRepo()
  const shape = (await repo.loadShape()) ?? CONTINENT
  const profile = await repo.loadProfile(seed)

  return { identity, repo, profile, shape }
}
