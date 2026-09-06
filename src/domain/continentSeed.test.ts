import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { continentSeedSql } from './continentSeed'
import { CONTINENT_ZONES } from './continent'

const MIGRATION = 'supabase/migrations/20260906200100_continent_seed.sql'

describe('the continent seed', () => {
  it('matches the committed migration', () => {
    // If this fails, the catalogue moved: run `npm run seed:sql` and commit.
    expect(continentSeedSql()).toBe(readFileSync(MIGRATION, 'utf8'))
  })

  it('seeds every zone the client knows about', () => {
    const sql = continentSeedSql()
    for (const zone of CONTINENT_ZONES) expect(sql).toContain(`'${zone.code}'`)
  })

  it('escapes apostrophes for Postgres', () => {
    expect(continentSeedSql()).toContain("'Anse de l''Ouest'")
  })
})
