-- Reference data the game logic reads by code. Idempotent so it can be replayed
-- on a database that already has it. No zones here on purpose: the continent is
-- generated client-side and its named areas are seeded once the map is stable.

insert into items (code, name, kind, slot, stackable, base_value) values
  ('wood',      'Bois',              'resource',   null,   true,  2),
  ('metal',     'Métal',             'resource',   null,   true,  5),
  ('food',      'Nourriture',        'resource',   null,   true,  3),
  ('crystal',   'Cristal',           'resource',   null,   true, 20),
  ('pelt',      'Peau',              'resource',   null,   true,  8),
  ('boots',     'Bottes',            'gear',       'feet', false, 60),
  ('coat',      'Manteau',           'gear',       'body', false, 80),
  ('pack',      'Sac de portage',    'gear',       'pack', false, 90),
  ('pickaxe',   'Pioche',            'tool',       'hands',false, 70),
  ('rope',      'Corde',             'tool',       'hands',false, 40),
  ('ration',    'Ration de survie',  'consumable', null,   true, 10)
on conflict (code) do nothing;

insert into upgrades (code, name, category, description, max_level, base_cost) values
  ('room',       'Chambre',    'camp',      'Une vraie chambre au campement : récupération plus rapide.', 5, 150),
  ('comfort',    'Confort',    'camp',      'Confort du campement : bonus de moral au départ.',            5, 120),
  ('workbench',  'Établi',     'camp',      'Réparer et améliorer son matériel entre deux expéditions.',   3, 300),
  ('endurance',  'Endurance',  'capacity',  'Marcher plus longtemps avant de fatiguer.',                   5, 100),
  ('sturdiness', 'Robustesse', 'capacity',  'Encaisser les mauvaises rencontres.',                         5, 100),
  ('swimming',   'Natation',   'capacity',  'Traverser rivières et bras de mer.',                          3, 200),
  ('climbing',   'Escalade',   'capacity',  'Franchir les reliefs au lieu de les contourner.',             3, 200),
  ('mining',     'Minage',     'capacity',  'Extraire plus vite et atteindre les filons profonds.',        5, 150),
  ('languages',  'Langues',    'knowledge', 'Comprendre les habitants et leurs indices.',                  3, 250),
  ('shortcuts',  'Raccourcis', 'knowledge', 'Connaître les chemins courts : estimations plus fiables.',     5, 180),
  ('crafts',     'Métiers',    'knowledge', 'Reconnaître et valoriser ce que l''on ramène.',               3, 220)
on conflict (code) do nothing;

insert into actions (code, name, zone_kinds, base_duration_seconds, description) values
  ('mine',    'Miner',              array['mountain','cave'],                   1800, 'Extraire minerai et cristaux.'),
  ('hunt',    'Chasser',            array['forest','plain','swamp'],            1500, 'Ramener viande et peaux.'),
  ('forage',  'Récolter',           array['forest','plain','coast','swamp'],     900, 'Bois, plantes, ressources de surface.'),
  ('build',   'Construire une cache', array['forest','mountain','cave','ruins'],2400, 'Stocker du butin sur place pour un prochain jour.'),
  ('explore', 'Explorer',           array['plain','forest','mountain','coast','swamp','ruins','cave'], 1200, 'Découvrir la zone et ce qu''elle cache.'),
  ('scavenge','Fouiller',           array['ruins'],                             1800, 'Fouiller les ruines : rare, risqué, précieux.'),
  ('rest',    'Se reposer',         array['base','plain','forest'],              600, 'Récupérer un peu d''endurance.')
on conflict (code) do nothing;
