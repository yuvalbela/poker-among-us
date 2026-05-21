-- Stage 3: Traitor mechanics

create table if not exists public.traitor_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  current_traitor_player_id uuid references public.players(id) on delete set null,
  rounds_survived int not null default 0,
  current_level int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.traitor_actions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_id uuid references public.game_rounds(id) on delete cascade,
  traitor_player_id uuid not null references public.players(id) on delete cascade,
  action_type text not null,
  target_player_id uuid references public.players(id) on delete set null,
  payload jsonb,
  level_used int not null,
  created_at timestamptz not null default now()
);

create index if not exists traitor_actions_round_idx on public.traitor_actions(round_id);

alter table public.traitor_state enable row level security;
alter table public.traitor_actions enable row level security;
alter table public.traitor_state replica identity full;
alter table public.traitor_actions replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.traitor_state;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.traitor_actions;
exception when duplicate_object then null; end $$;

-- Only the traitor themselves can SELECT their state row
drop policy if exists "traitor_state_select_self" on public.traitor_state;
create policy "traitor_state_select_self" on public.traitor_state
  for select to authenticated using (
    current_traitor_player_id in (
      select id from public.players where user_id = auth.uid()
    )
  );

-- Only the traitor themselves can SELECT their actions
drop policy if exists "traitor_actions_select_self" on public.traitor_actions;
create policy "traitor_actions_select_self" on public.traitor_actions
  for select to authenticated using (
    traitor_player_id in (
      select id from public.players where user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE policy — all writes go through security-definer RPCs.

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- Pick a random active player as traitor (admin-only, server-side random).
create or replace function public.pick_traitor(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_picked uuid;
begin
  if not public.is_room_admin(p_room_id) then
    raise exception 'only admin can pick traitor';
  end if;
  select p.id into v_picked
  from public.players p
  where p.room_id = p_room_id and p.chips > 0
  order by random() limit 1;
  if v_picked is null then raise exception 'no eligible players'; end if;
  insert into public.traitor_state (room_id, current_traitor_player_id, rounds_survived, current_level)
  values (p_room_id, v_picked, 0, 1)
  on conflict (room_id) do update set
    current_traitor_player_id = v_picked,
    rounds_survived = 0,
    current_level = 1,
    updated_at = now();
end $$;

-- Increment rounds_survived after each completed round (admin-only).
create or replace function public.traitor_round_survived(p_room_id uuid, p_level_up_rounds int default 2)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_room_admin(p_room_id) then raise exception 'only admin'; end if;
  update public.traitor_state set
    rounds_survived = rounds_survived + 1,
    current_level = least(4, 1 + ((rounds_survived + 1) / greatest(1, p_level_up_rounds))::int),
    updated_at = now()
  where room_id = p_room_id;
end $$;

-- Helper: confirm caller is the active traitor and return their player_id, room_id, level.
create or replace function public._traitor_check(p_round_id uuid, p_min_level int)
returns table(my_player_id uuid, room_id uuid, level int)
language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_player uuid; v_state public.traitor_state%rowtype;
begin
  select gr.room_id into v_room from public.game_rounds gr where gr.id = p_round_id;
  if v_room is null then raise exception 'round not found'; end if;
  select p.id into v_player from public.players p
    where p.room_id = v_room and p.user_id = auth.uid();
  if v_player is null then raise exception 'not in this room'; end if;
  select * into v_state from public.traitor_state where traitor_state.room_id = v_room;
  if v_state.current_traitor_player_id is null
     or v_state.current_traitor_player_id <> v_player then
    raise exception 'not the traitor';
  end if;
  if v_state.current_level < p_min_level then
    raise exception 'level too low: have %, need %', v_state.current_level, p_min_level;
  end if;
  my_player_id := v_player;
  room_id := v_room;
  level := v_state.current_level;
  return next;
end $$;

-- Level 1: peek a random card from a random other player.
create or replace function public.traitor_peek_random(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_check record; v_target record;
  v_cards jsonb; v_card jsonb;
begin
  select * into v_check from public._traitor_check(p_round_id, 1);
  if exists(select 1 from public.traitor_actions
            where round_id = p_round_id and traitor_player_id = v_check.my_player_id) then
    raise exception 'already used your ability this round';
  end if;
  select ph.player_id, phc.cards into v_target
  from public.player_hands ph
  join public.player_hole_cards phc on phc.player_hand_id = ph.id
  where ph.round_id = p_round_id and ph.player_id <> v_check.my_player_id and ph.status <> 'folded'
  order by random() limit 1;
  if v_target.player_id is null then raise exception 'no target available'; end if;
  v_cards := v_target.cards;
  v_card := v_cards -> floor(random() * jsonb_array_length(v_cards))::int;
  insert into public.traitor_actions(room_id, round_id, traitor_player_id, action_type, target_player_id, payload, level_used)
  values (v_check.room_id, p_round_id, v_check.my_player_id, 'peek_random', v_target.player_id,
          jsonb_build_object('card', v_card), v_check.level);
  return jsonb_build_object('target_player_id', v_target.player_id, 'card', v_card);
end $$;

-- Level 2: peek one random card from a chosen target.
create or replace function public.traitor_peek_player(p_round_id uuid, p_target_player_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_check record; v_cards jsonb; v_card jsonb;
begin
  select * into v_check from public._traitor_check(p_round_id, 2);
  if p_target_player_id = v_check.my_player_id then raise exception 'cannot target self'; end if;
  if exists(select 1 from public.traitor_actions
            where round_id = p_round_id and traitor_player_id = v_check.my_player_id) then
    raise exception 'already used your ability this round';
  end if;
  select phc.cards into v_cards
  from public.player_hands ph join public.player_hole_cards phc on phc.player_hand_id = ph.id
  where ph.round_id = p_round_id and ph.player_id = p_target_player_id;
  if v_cards is null then raise exception 'target hand not found'; end if;
  v_card := v_cards -> floor(random() * jsonb_array_length(v_cards))::int;
  insert into public.traitor_actions(room_id, round_id, traitor_player_id, action_type, target_player_id, payload, level_used)
  values (v_check.room_id, p_round_id, v_check.my_player_id, 'peek_player', p_target_player_id,
          jsonb_build_object('card', v_card), v_check.level);
  return jsonb_build_object('card', v_card);
end $$;

-- Level 3: view full 2-card hand of a chosen target.
create or replace function public.traitor_view_hand(p_round_id uuid, p_target_player_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_check record; v_cards jsonb;
begin
  select * into v_check from public._traitor_check(p_round_id, 3);
  if p_target_player_id = v_check.my_player_id then raise exception 'cannot target self'; end if;
  if exists(select 1 from public.traitor_actions
            where round_id = p_round_id and traitor_player_id = v_check.my_player_id
            and action_type = 'view_hand') then
    raise exception 'already viewed a hand this round';
  end if;
  select phc.cards into v_cards
  from public.player_hands ph join public.player_hole_cards phc on phc.player_hand_id = ph.id
  where ph.round_id = p_round_id and ph.player_id = p_target_player_id;
  if v_cards is null then raise exception 'target hand not found'; end if;
  insert into public.traitor_actions(room_id, round_id, traitor_player_id, action_type, target_player_id, payload, level_used)
  values (v_check.room_id, p_round_id, v_check.my_player_id, 'view_hand', p_target_player_id,
          jsonb_build_object('cards', v_cards), v_check.level);
  return jsonb_build_object('cards', v_cards);
end $$;

-- Level 4: swap one of own hole cards with the top of the deck.
create or replace function public.traitor_swap_card(p_round_id uuid, p_card_index int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_check record; v_hand_id uuid; v_deck jsonb; v_cards jsonb;
        v_new_card jsonb; v_old_card jsonb;
begin
  select * into v_check from public._traitor_check(p_round_id, 4);
  if p_card_index not in (0, 1) then raise exception 'card index must be 0 or 1'; end if;
  if exists(select 1 from public.traitor_actions
            where round_id = p_round_id and traitor_player_id = v_check.my_player_id
            and action_type = 'swap_card') then
    raise exception 'already swapped a card this round';
  end if;
  select id into v_hand_id from public.player_hands
    where round_id = p_round_id and player_id = v_check.my_player_id;
  if v_hand_id is null then raise exception 'your hand not found'; end if;
  select deck into v_deck from public.game_rounds where id = p_round_id;
  select cards into v_cards from public.player_hole_cards where player_hand_id = v_hand_id;
  if v_deck is null or jsonb_array_length(v_deck) = 0 then raise exception 'deck empty'; end if;
  v_new_card := v_deck -> 0;
  v_old_card := v_cards -> p_card_index;
  v_cards := jsonb_set(v_cards, array[p_card_index::text], v_new_card);
  update public.player_hole_cards set cards = v_cards where player_hand_id = v_hand_id;
  update public.game_rounds set deck = (v_deck - 0) || jsonb_build_array(v_old_card) where id = p_round_id;
  insert into public.traitor_actions(room_id, round_id, traitor_player_id, action_type, target_player_id, payload, level_used)
  values (v_check.room_id, p_round_id, v_check.my_player_id, 'swap_card', null,
          jsonb_build_object('old', v_old_card, 'new', v_new_card, 'index', p_card_index), v_check.level);
  return jsonb_build_object('old', v_old_card, 'new', v_new_card);
end $$;

-- Grants so authenticated role can call these RPCs.
grant execute on function public.pick_traitor(uuid) to authenticated;
grant execute on function public.traitor_round_survived(uuid, int) to authenticated;
grant execute on function public.traitor_peek_random(uuid) to authenticated;
grant execute on function public.traitor_peek_player(uuid, uuid) to authenticated;
grant execute on function public.traitor_view_hand(uuid, uuid) to authenticated;
grant execute on function public.traitor_swap_card(uuid, int) to authenticated;
