-- The continent, as the client knows it. GENERATED from src/domain/continent.ts
-- by src/domain/continentSeed.ts — do not edit by hand: run `npm run seed:sql`
-- and commit the result. src/domain/continentSeed.test.ts fails if the two
-- drift apart.
--
-- Coordinates are the world space of src/game/terrain.ts. Every zone sits on
-- land and inside a surveyed disc, which is what makes it reachable on the map.

insert into zones (code, name, kind, center_x, center_y, radius, difficulty, is_public, has_elevator, danger) values
  ('base-nord', 'Ascenseur Nord', 'base', 1520, 520, 90, 1, true, true, 1),
  ('crete-fer', 'Crête de Fer', 'mountain', 1560, 690, 110, 1.85, true, false, 4),
  ('bois-nord', 'Bois du Nord', 'forest', 1350, 430, 120, 1.3, true, false, 2),
  ('terrasses', 'Terrasses', 'plain', 1700, 620, 115, 1.05, true, false, 2),
  ('base-ouest', 'Ascenseur Ouest', 'base', 760, 700, 90, 1, true, true, 1),
  ('pinede', 'Pinède', 'forest', 930, 610, 120, 1.3, true, false, 2),
  ('vieux-camp', 'Vieux Camp', 'ruins', 760, 930, 110, 1.2, true, false, 3),
  ('marais-bas', 'Marais Bas', 'swamp', 620, 830, 105, 1.5, true, false, 3),
  ('anse-ouest', 'Anse de l''Ouest', 'coast', 570, 620, 100, 1.15, true, false, 2),
  ('base-sud-est', 'Ascenseur Sud-Est', 'base', 1450, 1030, 90, 1, true, true, 1),
  ('salants', 'Marais Salants', 'swamp', 1680, 1030, 110, 1.5, true, false, 3),
  ('ruines-basses', 'Ruines Basses', 'ruins', 1300, 1150, 115, 1.2, true, false, 4),
  ('plaine-sud', 'Plaine Sud', 'plain', 1460, 1215, 120, 1.05, true, false, 2),
  ('grotte-noire', 'Grotte Noire', 'cave', 1570, 900, 100, 1.6, true, false, 5)
on conflict (code) do update set
  name = excluded.name,
  kind = excluded.kind,
  center_x = excluded.center_x,
  center_y = excluded.center_y,
  radius = excluded.radius,
  difficulty = excluded.difficulty,
  is_public = excluded.is_public,
  has_elevator = excluded.has_elevator,
  danger = excluded.danger;

insert into actions (code, name, zone_kinds, base_duration_seconds, skill_code, yields, xp) values
  ('forage', 'Récolter', array['forest','plain','coast','swamp']::text[], 900, null, '{"wood":2,"food":1}'::jsonb, 8),
  ('hunt', 'Chasser', array['forest','plain','swamp']::text[], 1500, null, '{"food":2,"pelt":0.7}'::jsonb, 12),
  ('mine', 'Miner', array['mountain','cave']::text[], 1800, 'mining', '{"metal":3,"crystal":0.5}'::jsonb, 16),
  ('scavenge', 'Fouiller', array['ruins']::text[], 1800, 'languages', '{"crystal":0.8,"metal":1,"relic":0.25}'::jsonb, 18),
  ('explore', 'Explorer', array['plain','forest','mountain','coast','swamp','ruins','cave']::text[], 1200, 'shortcuts', '{}'::jsonb, 25),
  ('build', 'Construire une cache', array['forest','mountain','cave','ruins']::text[], 2400, 'crafts', '{}'::jsonb, 20),
  ('rest', 'Se reposer', array['base','plain','forest']::text[], 600, 'endurance', '{}'::jsonb, 2),
  ('rich-seam', 'Exploiter un filon précieux', '{}'::text[], 1500, 'mining', '{"crystal":2,"relic":0.5}'::jsonb, 30)
on conflict (code) do update set
  name = excluded.name,
  zone_kinds = excluded.zone_kinds,
  base_duration_seconds = excluded.base_duration_seconds,
  skill_code = excluded.skill_code,
  yields = excluded.yields,
  xp = excluded.xp;

insert into items (code, name, kind, stackable, base_value) values
  ('wood', 'Bois', 'resource', true, 2),
  ('food', 'Nourriture', 'resource', true, 3),
  ('metal', 'Métal', 'resource', true, 5),
  ('pelt', 'Peau', 'resource', true, 8),
  ('crystal', 'Cristal', 'resource', true, 20),
  ('relic', 'Relique', 'resource', true, 45)
on conflict (code) do update set
  name = excluded.name,
  base_value = excluded.base_value;

-- Zone-specific offerings stay empty: what a zone offers follows from its
-- kind (actions.zone_kinds), and events unlock the rest at runtime.
