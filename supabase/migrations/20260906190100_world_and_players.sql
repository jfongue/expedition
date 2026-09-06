-- Core world state: who the players are, where they stand, what they own and
-- what they have unlocked. Every table is RLS-protected and explicitly granted
-- to the API roles: new tables in `public` are no longer auto-exposed.

-- Keeps updated_at honest without the client having to send it.
create function public.touch_updated_at() returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Players ---------------------------------------------------------------------
-- One row per auth user (anonymous sign-in included): identity, live position
-- on the continent map and the macro-loop counters.
create table players (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  color text not null default '#3b82f6',
  -- 'base' aboard the ship / at camp, 'expedition' down on the continent.
  status text not null default 'base' check (status in ('base', 'expedition', 'offline')),
  -- World coordinates, not grid cells: the map is a generated continent.
  position_x double precision not null default 1200,
  position_y double precision not null default 800,
  current_zone_id uuid,
  level int not null default 1 check (level >= 1),
  xp int not null default 0 check (xp >= 0),
  credits int not null default 0 check (credits >= 0),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index players_status_idx on players (status, last_seen_at desc);

create trigger players_touch_updated_at
  before update on players
  for each row execute function public.touch_updated_at();

alter table players enable row level security;
grant select, insert, update on players to authenticated;

-- Positions are public: seeing other explorers move is the point of the map.
create policy "players are readable by any authenticated user"
  on players for select to authenticated using (true);

create policy "players can insert their own row"
  on players for insert to authenticated with check (auth.uid() = id);

create policy "players can update their own row"
  on players for update to authenticated using (auth.uid() = id);

-- Anonymous sign-in mints a user with no client round-trip to spare, so the
-- player row is created by the auth trigger rather than by the app.
create function public.handle_new_auth_user() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.players (id, username)
  values (new.id, 'Explorateur-' || substr(replace(new.id::text, '-', ''), 1, 8))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Zones -----------------------------------------------------------------------
-- Named areas of the continent. `kind` drives which actions are offered once a
-- player arrives; bases are the fixed elevator landing points.
create table zones (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('base', 'plain', 'forest', 'mountain', 'coast', 'swamp', 'ruins', 'cave')),
  center_x double precision not null,
  center_y double precision not null,
  radius double precision not null default 120 check (radius > 0),
  -- Multiplies the time needed to travel *into* the zone. 1 = open ground.
  difficulty double precision not null default 1 check (difficulty > 0),
  -- Public zones sit around the fixed elevators and need no discovery.
  is_public boolean not null default false,
  has_elevator boolean not null default false,
  danger int not null default 1 check (danger between 1 and 5),
  created_at timestamptz not null default now()
);

create index zones_kind_idx on zones (kind);

alter table players
  add constraint players_current_zone_fkey
  foreign key (current_zone_id) references zones (id) on delete set null;

alter table zones enable row level security;
grant select on zones to authenticated;

create policy "zones are readable by any authenticated user"
  on zones for select to authenticated using (true);

-- Which zones a given player has actually uncovered: the mission map is mostly
-- greyed out and lights up per player.
create table player_zone_discoveries (
  player_id uuid not null references players (id) on delete cascade,
  zone_id uuid not null references zones (id) on delete cascade,
  discovered_at timestamptz not null default now(),
  primary key (player_id, zone_id)
);

alter table player_zone_discoveries enable row level security;
grant select, insert on player_zone_discoveries to authenticated;

create policy "players read their own discoveries"
  on player_zone_discoveries for select to authenticated using (auth.uid() = player_id);

create policy "players record their own discoveries"
  on player_zone_discoveries for insert to authenticated with check (auth.uid() = player_id);

-- Upgrades --------------------------------------------------------------------
-- Catalogue of everything loot can be invested in: camp comfort, capacities
-- (endurance, climbing, mining...) and knowledge (languages, shortcuts, trades).
create table upgrades (
  code text primary key,
  name text not null,
  category text not null check (category in ('camp', 'capacity', 'knowledge')),
  description text,
  max_level int not null default 5 check (max_level >= 1),
  base_cost int not null default 100 check (base_cost >= 0)
);

alter table upgrades enable row level security;
grant select on upgrades to authenticated;

create policy "upgrades are readable by any authenticated user"
  on upgrades for select to authenticated using (true);

create table player_upgrades (
  player_id uuid not null references players (id) on delete cascade,
  upgrade_code text not null references upgrades (code) on delete cascade,
  level int not null default 1 check (level >= 1),
  updated_at timestamptz not null default now(),
  primary key (player_id, upgrade_code)
);

create trigger player_upgrades_touch_updated_at
  before update on player_upgrades
  for each row execute function public.touch_updated_at();

alter table player_upgrades enable row level security;
grant select, insert, update on player_upgrades to authenticated;

create policy "players read their own upgrades"
  on player_upgrades for select to authenticated using (auth.uid() = player_id);

create policy "players buy their own upgrades"
  on player_upgrades for insert to authenticated with check (auth.uid() = player_id);

create policy "players level their own upgrades"
  on player_upgrades for update to authenticated using (auth.uid() = player_id);

-- Items and inventory ---------------------------------------------------------
create table items (
  code text primary key,
  name text not null,
  kind text not null check (kind in ('resource', 'gear', 'tool', 'consumable', 'quest')),
  -- Only gear/tools occupy an equipment slot.
  slot text check (slot in ('head', 'body', 'feet', 'hands', 'pack')),
  stackable boolean not null default true,
  base_value int not null default 1 check (base_value >= 0),
  constraint items_slot_matches_kind check (slot is null or kind in ('gear', 'tool'))
);

alter table items enable row level security;
grant select on items to authenticated;

create policy "items are readable by any authenticated user"
  on items for select to authenticated using (true);

create table player_inventory (
  player_id uuid not null references players (id) on delete cascade,
  item_code text not null references items (code) on delete cascade,
  quantity int not null default 0 check (quantity >= 0),
  equipped boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (player_id, item_code)
);

create trigger player_inventory_touch_updated_at
  before update on player_inventory
  for each row execute function public.touch_updated_at();

alter table player_inventory enable row level security;
grant select, insert, update, delete on player_inventory to authenticated;

-- Inventory stays private: trades are the only way to learn what someone carries.
create policy "players read their own inventory"
  on player_inventory for select to authenticated using (auth.uid() = player_id);

create policy "players write their own inventory"
  on player_inventory for insert to authenticated with check (auth.uid() = player_id);

create policy "players update their own inventory"
  on player_inventory for update to authenticated using (auth.uid() = player_id);

create policy "players drop their own inventory"
  on player_inventory for delete to authenticated using (auth.uid() = player_id);

-- Realtime: other players' positions and statuses drive the live map.
alter publication supabase_realtime add table players;
