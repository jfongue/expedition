-- Profiles: one row per authenticated player
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are readable by any authenticated user"
  on profiles for select
  to authenticated
  using (true);

create policy "users can insert their own profile"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

-- Games: one board game session
create table games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'lobby' check (status in ('lobby', 'active', 'finished')),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

alter table games enable row level security;

create policy "games are readable by any authenticated user"
  on games for select
  to authenticated
  using (true);

create policy "authenticated users can create games"
  on games for insert
  to authenticated
  with check (auth.uid() = created_by);

-- Game players: who is seated in which game, and their current board position
create table game_players (
  game_id uuid not null references games (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  color text not null,
  turn_order int not null,
  position_x int,
  position_y int,
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

alter table game_players enable row level security;

create policy "game_players are readable by any authenticated user"
  on game_players for select
  to authenticated
  using (true);

create policy "users can seat themselves"
  on game_players for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own seat"
  on game_players for update
  to authenticated
  using (auth.uid() = user_id);

-- Moves: append-only log of committed board moves (source of truth for replay/audit)
create table moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  user_id uuid not null references profiles (id),
  turn_number int not null,
  position_x int not null,
  position_y int not null,
  created_at timestamptz not null default now()
);

alter table moves enable row level security;

create policy "moves are readable by any authenticated user"
  on moves for select
  to authenticated
  using (true);

create policy "users can record their own moves"
  on moves for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Realtime: broadcast committed moves and seat/position updates to all clients
alter publication supabase_realtime add table moves;
alter publication supabase_realtime add table game_players;
