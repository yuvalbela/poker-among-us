-- Stage 3 security migration: switch from client_id to auth.uid() + tighten RLS
-- WARNING: Drops existing data (rooms/players/messages/game_*).

drop table if exists public.game_actions cascade;
drop table if exists public.player_hands cascade;
drop table if exists public.game_rounds cascade;
drop table if exists public.messages cascade;
drop table if exists public.players cascade;
drop table if exists public.rooms cascade;

-- Reuse enums if they exist; create otherwise
do $$ begin
  create type poker_phase as enum ('preflop','flop','turn','river','showdown','finished');
exception when duplicate_object then null; end $$;
do $$ begin
  create type player_hand_status as enum ('active','folded','all_in');
exception when duplicate_object then null; end $$;
do $$ begin
  create type poker_action as enum ('fold','check','call','raise','all_in','small_blind','big_blind');
exception when duplicate_object then null; end $$;

-- ROOMS
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- PLAYERS
create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  avatar text,
  chips int not null default 1000,
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  unique(room_id, user_id)
);
create index on public.players(room_id);

-- MESSAGES
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
create index on public.messages(room_id, created_at);

-- GAME_ROUNDS
create table public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_number int not null,
  phase poker_phase not null default 'preflop',
  pot int not null default 0,
  current_bet int not null default 0,
  community_cards jsonb not null default '[]'::jsonb,
  deck jsonb not null default '[]'::jsonb,
  dealer_index int not null default 0,
  current_turn_index int,
  last_raise_index int,
  small_blind int not null default 10,
  big_blind int not null default 20,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index on public.game_rounds(room_id, round_number);

-- PLAYER_HANDS (public fields only — no cards here)
create table public.player_hands (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  seat_index int not null,
  status player_hand_status not null default 'active',
  current_bet int not null default 0,
  total_bet_in_round int not null default 0,
  chips_at_start int not null,
  unique(round_id, player_id)
);
create index on public.player_hands(round_id);

-- PLAYER_HOLE_CARDS (separate table — strict RLS)
create table public.player_hole_cards (
  player_hand_id uuid primary key references public.player_hands(id) on delete cascade,
  cards jsonb not null
);

-- GAME_ACTIONS
create table public.game_actions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  phase poker_phase not null,
  action poker_action not null,
  amount int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.game_actions(round_id, created_at);

-- Helper functions
create or replace function public.is_room_player(rid uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists(
    select 1 from public.players p
    where p.room_id = rid and p.user_id = auth.uid()
  )
$$;

create or replace function public.is_room_admin(rid uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists(
    select 1 from public.rooms r
    where r.id = rid and r.admin_user_id = auth.uid()
  )
$$;

-- Enable RLS
alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.messages enable row level security;
alter table public.game_rounds enable row level security;
alter table public.player_hands enable row level security;
alter table public.player_hole_cards enable row level security;
alter table public.game_actions enable row level security;

-- Replica identity full (for realtime)
alter table public.rooms replica identity full;
alter table public.players replica identity full;
alter table public.messages replica identity full;
alter table public.game_rounds replica identity full;
alter table public.player_hands replica identity full;
alter table public.player_hole_cards replica identity full;
alter table public.game_actions replica identity full;

-- Add to realtime publication
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.game_rounds;
alter publication supabase_realtime add table public.player_hands;
alter publication supabase_realtime add table public.player_hole_cards;
alter publication supabase_realtime add table public.game_actions;

-- ============================
-- POLICIES
-- ============================

-- ROOMS
create policy "rooms_select_authenticated" on public.rooms
  for select to authenticated using (true);
create policy "rooms_insert_self_admin" on public.rooms
  for insert to authenticated with check (admin_user_id = auth.uid());
create policy "rooms_update_admin" on public.rooms
  for update to authenticated using (admin_user_id = auth.uid()) with check (admin_user_id = auth.uid());
create policy "rooms_delete_admin" on public.rooms
  for delete to authenticated using (admin_user_id = auth.uid());

-- PLAYERS — anyone authed can read (so lobby works); insert/update only self
create policy "players_select_authenticated" on public.players
  for select to authenticated using (true);
create policy "players_insert_self" on public.players
  for insert to authenticated with check (user_id = auth.uid());
create policy "players_update_self_or_admin" on public.players
  for update to authenticated
  using (user_id = auth.uid() or public.is_room_admin(room_id))
  with check (true);
create policy "players_delete_self_or_admin" on public.players
  for delete to authenticated using (user_id = auth.uid() or public.is_room_admin(room_id));

-- MESSAGES — only in rooms I'm playing in
create policy "messages_select_in_room" on public.messages
  for select to authenticated using (public.is_room_player(room_id));
create policy "messages_insert_self" on public.messages
  for insert to authenticated with check (
    public.is_room_player(room_id) and
    player_id in (select id from public.players where user_id = auth.uid() and room_id = messages.room_id)
  );

-- GAME_ROUNDS — players in room can read; admin manages; players can update for their turn actions
create policy "game_rounds_select_in_room" on public.game_rounds
  for select to authenticated using (public.is_room_player(room_id));
create policy "game_rounds_insert_admin" on public.game_rounds
  for insert to authenticated with check (public.is_room_admin(room_id));
create policy "game_rounds_update_admin_or_player" on public.game_rounds
  for update to authenticated
  using (public.is_room_admin(room_id) or public.is_room_player(room_id))
  with check (public.is_room_admin(room_id) or public.is_room_player(room_id));
create policy "game_rounds_delete_admin" on public.game_rounds
  for delete to authenticated using (public.is_room_admin(room_id));

-- PLAYER_HANDS — anyone in room can read the public fields
create policy "player_hands_select_in_room" on public.player_hands
  for select to authenticated using (
    exists (
      select 1 from public.game_rounds gr
      where gr.id = player_hands.round_id and public.is_room_player(gr.room_id)
    )
  );
create policy "player_hands_insert_admin" on public.player_hands
  for insert to authenticated with check (
    exists (
      select 1 from public.game_rounds gr
      where gr.id = player_hands.round_id and public.is_room_admin(gr.room_id)
    )
  );
create policy "player_hands_update_self_or_admin" on public.player_hands
  for update to authenticated using (
    player_id in (select id from public.players where user_id = auth.uid())
    or exists (
      select 1 from public.game_rounds gr
      where gr.id = player_hands.round_id and public.is_room_admin(gr.room_id)
    )
  ) with check (true);

-- PLAYER_HOLE_CARDS — strict: only owner or showdown
create policy "hole_cards_select_owner_or_showdown" on public.player_hole_cards
  for select to authenticated using (
    exists (
      select 1 from public.player_hands ph
      join public.players p on p.id = ph.player_id
      where ph.id = player_hole_cards.player_hand_id and p.user_id = auth.uid()
    )
    or exists (
      select 1 from public.player_hands ph
      join public.game_rounds gr on gr.id = ph.round_id
      where ph.id = player_hole_cards.player_hand_id
      and gr.phase in ('showdown', 'finished')
    )
  );
create policy "hole_cards_insert_admin" on public.player_hole_cards
  for insert to authenticated with check (
    exists (
      select 1 from public.player_hands ph
      join public.game_rounds gr on gr.id = ph.round_id
      where ph.id = player_hole_cards.player_hand_id
      and public.is_room_admin(gr.room_id)
    )
  );
create policy "hole_cards_update_admin" on public.player_hole_cards
  for update to authenticated using (
    exists (
      select 1 from public.player_hands ph
      join public.game_rounds gr on gr.id = ph.round_id
      where ph.id = player_hole_cards.player_hand_id
      and public.is_room_admin(gr.room_id)
    )
  ) with check (true);

-- GAME_ACTIONS — players in room read; player inserts their own; admin can insert blinds
create policy "game_actions_select_in_room" on public.game_actions
  for select to authenticated using (
    exists (
      select 1 from public.game_rounds gr
      where gr.id = game_actions.round_id and public.is_room_player(gr.room_id)
    )
  );
create policy "game_actions_insert_self_or_admin" on public.game_actions
  for insert to authenticated with check (
    player_id in (select id from public.players where user_id = auth.uid())
    or exists (
      select 1 from public.game_rounds gr
      where gr.id = game_actions.round_id and public.is_room_admin(gr.room_id)
    )
  );
