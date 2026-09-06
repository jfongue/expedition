-- What the macro loop needs to survive a reload: which day the player is on,
-- and enough on the expedition row to replay a run exactly as it happened.

alter table players
  add column day int not null default 1 check (day >= 1),
  -- Set after a day spent at camp: the next expedition is quicker and sharper.
  add column rested boolean not null default false;

alter table expeditions
  add column day int not null default 1 check (day >= 1),
  -- Seeds both the simulation and the loot rolls, so a settled day can be
  -- audited or replayed server-side later on.
  add column seed bigint,
  add column mission_code text,
  add column objective_action_code text references actions (code) on delete set null,
  add column objective_zone_id uuid references zones (id) on delete set null,
  add column bonus_credits int not null default 0 check (bonus_credits >= 0),
  add column outcome text check (outcome in ('on-time', 'rescued', 'stranded'));

create index expeditions_day_idx on expeditions (organizer_id, day desc);

-- The settlement, so a debrief can be reopened without recomputing it.
alter table expedition_members
  add column net_credits int not null default 0 check (net_credits >= 0),
  add column rescue_credits int not null default 0 check (rescue_credits >= 0),
  add column bonus_credits int not null default 0 check (bonus_credits >= 0),
  add column xp_gained int not null default 0 check (xp_gained >= 0),
  add column loot jsonb not null default '{}'::jsonb;

-- Actions carry their loot table and their experience in the catalogue, so the
-- client no longer has to hard-code either.
alter table actions
  add column xp int not null default 10 check (xp >= 0);
