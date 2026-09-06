-- The macro loop: an expedition is one day on the continent, from the elevator
-- ride down to the mandatory pickup before nightfall, followed by the tax and
-- the loot settlement.

-- Catalogue of contextual actions and which zone kinds offer them.
create table actions (
  code text primary key,
  name text not null,
  zone_kinds text[] not null default '{}',
  base_duration_seconds int not null default 600 check (base_duration_seconds > 0),
  description text
);

alter table actions enable row level security;
grant select on actions to authenticated;

create policy "actions are readable by any authenticated user"
  on actions for select to authenticated using (true);

-- Expeditions -----------------------------------------------------------------
-- Solo runs have a single member; later, players organise their own and recruit
-- a crew by application before sundown.
create table expeditions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organizer_id uuid not null references players (id) on delete cascade,
  target_zone_id uuid references zones (id) on delete set null,
  status text not null default 'recruiting'
    check (status in ('recruiting', 'scheduled', 'active', 'returned', 'failed', 'cancelled')),
  -- Applications close, then the ship leaves; curfew is the sunset pickup.
  applications_close_at timestamptz,
  departure_at timestamptz,
  curfew_at timestamptz,
  -- Share of the gross loot owed to the base on return, in percent.
  tax_rate int not null default 10 check (tax_rate between 0 and 100),
  max_crew int not null default 1 check (max_crew >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expeditions_status_idx on expeditions (status, departure_at);
create index expeditions_organizer_idx on expeditions (organizer_id);

create trigger expeditions_touch_updated_at
  before update on expeditions
  for each row execute function public.touch_updated_at();

create table expedition_members (
  expedition_id uuid not null references expeditions (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  role text not null default 'crew' check (role in ('organizer', 'crew')),
  status text not null default 'applied'
    check (status in ('applied', 'accepted', 'rejected', 'aboard', 'returned', 'lost')),
  -- Settlement, filled in on return: gross loot value, expedition tax, remainder.
  gross_credits int not null default 0 check (gross_credits >= 0),
  tax_credits int not null default 0 check (tax_credits >= 0),
  settled_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (expedition_id, player_id)
);

create index expedition_members_player_idx on expedition_members (player_id);

-- SECURITY DEFINER on purpose: a policy on expedition_members that queried
-- expedition_members would recurse.
create function public.is_expedition_member(target_expedition uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from expedition_members
    where expedition_id = target_expedition
      and player_id = auth.uid()
  );
$$;

alter table expeditions enable row level security;
alter table expedition_members enable row level security;
grant select, insert, update on expeditions to authenticated;
grant select, insert, update, delete on expedition_members to authenticated;

-- Open expeditions are visible to everyone (that is how you apply); once under
-- way they are only the crew's business.
create policy "expeditions are readable while open or to their crew"
  on expeditions for select to authenticated
  using (
    status in ('recruiting', 'scheduled')
    or auth.uid() = organizer_id
    or public.is_expedition_member(id)
  );

create policy "players organise their own expeditions"
  on expeditions for insert to authenticated with check (auth.uid() = organizer_id);

create policy "organizers update their expeditions"
  on expeditions for update to authenticated using (auth.uid() = organizer_id);

create policy "crew members read the roster"
  on expedition_members for select to authenticated
  using (auth.uid() = player_id or public.is_expedition_member(expedition_id));

create policy "players apply for themselves"
  on expedition_members for insert to authenticated with check (auth.uid() = player_id);

-- The organizer picks the crew; a member can only update their own row.
create policy "organizers and members update the roster"
  on expedition_members for update to authenticated
  using (
    auth.uid() = player_id
    or exists (
      select 1 from expeditions e
      where e.id = expedition_id and e.organizer_id = auth.uid()
    )
  );

create policy "players withdraw their own application"
  on expedition_members for delete to authenticated using (auth.uid() = player_id);

-- Expedition plan -------------------------------------------------------------
-- The day's plan: chained moves and actions, always ending with the return to
-- the landing zone. Rows are rewritten as the player changes their mind mid-run.
create table expedition_steps (
  id uuid primary key default gen_random_uuid(),
  expedition_id uuid not null references expeditions (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  step_order int not null,
  kind text not null check (kind in ('move', 'action', 'return')),
  zone_id uuid references zones (id) on delete set null,
  action_code text references actions (code) on delete set null,
  planned_start_at timestamptz,
  planned_duration_seconds int check (planned_duration_seconds > 0),
  -- Time estimates get fuzzier late in the day and at low level; the client
  -- shows the plan +/- this margin.
  estimate_error_seconds int not null default 0 check (estimate_error_seconds >= 0),
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'done', 'skipped', 'aborted')),
  result jsonb,
  created_at timestamptz not null default now(),
  unique (expedition_id, player_id, step_order),
  constraint expedition_steps_action_needs_code
    check (kind <> 'action' or action_code is not null),
  constraint expedition_steps_move_needs_zone
    check (kind <> 'move' or zone_id is not null)
);

create index expedition_steps_player_idx on expedition_steps (player_id, status);

alter table expedition_steps enable row level security;
grant select, insert, update, delete on expedition_steps to authenticated;

create policy "players read their own plan"
  on expedition_steps for select to authenticated using (auth.uid() = player_id);

create policy "players write their own plan"
  on expedition_steps for insert to authenticated with check (auth.uid() = player_id);

create policy "players update their own plan"
  on expedition_steps for update to authenticated using (auth.uid() = player_id);

create policy "players delete their own plan"
  on expedition_steps for delete to authenticated using (auth.uid() = player_id);

-- Events ----------------------------------------------------------------------
-- Append-only feed: random encounters, group crossings, loot finds, curfew
-- warnings. Doubles as the catch-up history when a player comes back online.
create table events (
  id uuid primary key default gen_random_uuid(),
  -- Null recipient means a world-wide event.
  player_id uuid references players (id) on delete cascade,
  expedition_id uuid references expeditions (id) on delete cascade,
  zone_id uuid references zones (id) on delete set null,
  kind text not null,
  title text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index events_player_idx on events (player_id, created_at desc);
create index events_unread_idx on events (player_id) where read_at is null;

alter table events enable row level security;
grant select, insert, update on events to authenticated;

create policy "players read their own and world events"
  on events for select to authenticated
  using (player_id is null or auth.uid() = player_id);

create policy "players record their own events"
  on events for insert to authenticated with check (auth.uid() = player_id);

create policy "players mark their own events read"
  on events for update to authenticated using (auth.uid() = player_id);

alter publication supabase_realtime add table events;
alter publication supabase_realtime add table expedition_members;
alter publication supabase_realtime add table expedition_steps;
