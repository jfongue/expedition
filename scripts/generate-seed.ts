import { writeFileSync } from 'node:fs'
import { continentSeedSql } from '../src/domain/continentSeed'

const target = 'supabase/migrations/20260906200100_continent_seed.sql'
writeFileSync(target, continentSeedSql())
process.stdout.write(`${target} regenerated from src/domain/continent.ts\n`)
