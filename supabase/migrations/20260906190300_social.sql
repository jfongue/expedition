-- Multiplayer layer: friends, groups, chat, and material transfers.

-- Friends ---------------------------------------------------------------------
-- Directed request that becomes symmetric once accepted.
create table friendships (
  requester_id uuid not null references players (id) on delete cascade,
  addressee_id uuid not null references players (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

create index friendships_addressee_idx on friendships (addressee_id, status);

alter table friendships enable row level security;
grant select, insert, update, delete on friendships to authenticated;

create policy "players read friendships they are part of"
  on friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));

create policy "players send their own friend requests"
  on friendships for insert to authenticated with check (auth.uid() = requester_id);

create policy "either side updates the friendship"
  on friendships for update to authenticated
  using (auth.uid() in (requester_id, addressee_id));

create policy "either side removes the friendship"
  on friendships for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- Groups ----------------------------------------------------------------------
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references players (id) on delete cascade,
  -- Shared code so a player can join a group they were told about out of band.
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, player_id)
);

create index group_members_player_idx on group_members (player_id);

-- SECURITY DEFINER breaks the policy recursion: a group_members policy that
-- selected from group_members would call itself.
create function public.is_group_member(target_group uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = target_group and player_id = auth.uid()
  );
$$;

create function public.shares_group_with(other_player uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1
    from group_members mine
    join group_members theirs on theirs.group_id = mine.group_id
    where mine.player_id = auth.uid()
      and theirs.player_id = other_player
  );
$$;

alter table groups enable row level security;
alter table group_members enable row level security;
grant select, insert, update, delete on groups to authenticated;
grant select, insert, delete on group_members to authenticated;

-- Groups and their rosters are not secret: joining by invite code requires
-- reading a group you are not in yet.
create policy "groups are readable by any authenticated user"
  on groups for select to authenticated using (true);

create policy "players create their own groups"
  on groups for insert to authenticated with check (auth.uid() = owner_id);

create policy "owners update their group"
  on groups for update to authenticated using (auth.uid() = owner_id);

create policy "owners delete their group"
  on groups for delete to authenticated using (auth.uid() = owner_id);

create policy "group rosters are readable by any authenticated user"
  on group_members for select to authenticated using (true);

create policy "players join groups themselves"
  on group_members for insert to authenticated with check (auth.uid() = player_id);

create policy "players leave, owners remove"
  on group_members for delete to authenticated
  using (
    auth.uid() = player_id
    or exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid())
  );

-- Seeing where group mates are heading, not just where they stand, is the whole
-- point of a group.
create policy "group mates read each other's plan"
  on expedition_steps for select to authenticated
  using (public.shares_group_with(player_id));

-- Chat ------------------------------------------------------------------------
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('global', 'group', 'zone')),
  group_id uuid references groups (id) on delete cascade,
  zone_id uuid references zones (id) on delete cascade,
  sender_id uuid not null references players (id) on delete cascade,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint chat_messages_scope check (
    (channel = 'global' and group_id is null and zone_id is null)
    or (channel = 'group' and group_id is not null and zone_id is null)
    or (channel = 'zone' and zone_id is not null and group_id is null)
  )
);

create index chat_messages_global_idx on chat_messages (created_at desc) where channel = 'global';
create index chat_messages_group_idx on chat_messages (group_id, created_at desc);
create index chat_messages_zone_idx on chat_messages (zone_id, created_at desc);

alter table chat_messages enable row level security;
grant select, insert on chat_messages to authenticated;

create policy "chat is readable in global, zone and own group channels"
  on chat_messages for select to authenticated
  using (channel in ('global', 'zone') or public.is_group_member(group_id));

create policy "players post as themselves in channels they belong to"
  on chat_messages for insert to authenticated
  with check (
    auth.uid() = sender_id
    and (channel in ('global', 'zone') or public.is_group_member(group_id))
  );

-- Trades ----------------------------------------------------------------------
-- Simple material transfer between two players, at base or in the field. Both
-- sides can put items in; the receiver accepts or declines.
create table trades (
  id uuid primary key default gen_random_uuid(),
  from_player_id uuid not null references players (id) on delete cascade,
  to_player_id uuid not null references players (id) on delete cascade,
  zone_id uuid references zones (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint trades_no_self check (from_player_id <> to_player_id)
);

create index trades_participants_idx on trades (to_player_id, status, created_at desc);
create index trades_sender_idx on trades (from_player_id, status, created_at desc);

create table trade_items (
  trade_id uuid not null references trades (id) on delete cascade,
  offered_by uuid not null references players (id) on delete cascade,
  item_code text not null references items (code) on delete cascade,
  quantity int not null check (quantity > 0),
  primary key (trade_id, offered_by, item_code)
);

create function public.can_access_trade(target_trade uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from trades
    where id = target_trade
      and auth.uid() in (from_player_id, to_player_id)
  );
$$;

alter table trades enable row level security;
alter table trade_items enable row level security;
grant select, insert, update on trades to authenticated;
grant select, insert, delete on trade_items to authenticated;

create policy "players read trades they are part of"
  on trades for select to authenticated
  using (auth.uid() in (from_player_id, to_player_id));

create policy "players open their own trades"
  on trades for insert to authenticated with check (auth.uid() = from_player_id);

-- The sender cancels, the receiver accepts or declines.
create policy "either side resolves the trade"
  on trades for update to authenticated
  using (auth.uid() in (from_player_id, to_player_id));

create policy "trade items are readable by both sides"
  on trade_items for select to authenticated using (public.can_access_trade(trade_id));

create policy "players only offer their own items"
  on trade_items for insert to authenticated
  with check (auth.uid() = offered_by and public.can_access_trade(trade_id));

create policy "players withdraw their own offer"
  on trade_items for delete to authenticated using (auth.uid() = offered_by);

alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table group_members;
alter publication supabase_realtime add table friendships;
alter publication supabase_realtime add table trades;
alter publication supabase_realtime add table trade_items;
