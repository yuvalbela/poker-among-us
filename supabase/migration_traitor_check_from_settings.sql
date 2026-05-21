-- Recompute traitor effective level from rooms.settings on every RPC call,
-- so server-side checks match the UI (which already reads from settings).
-- Semantics: levelNRounds = "round number where level N starts".
-- current round = traitor_state.rounds_survived + 1.

create or replace function public._traitor_check(p_round_id uuid, p_min_level int)
returns table(my_player_id uuid, room_id uuid, level int)
language plpgsql security definer set search_path = public as $$
declare
  v_room uuid; v_player uuid; v_state public.traitor_state%rowtype;
  v_settings jsonb; v_survived int; v_current_round int;
  v_l2 int; v_l3 int; v_l4 int;
  v_a2 bool; v_a3 bool; v_a4 bool;
  v_effective_level int;
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

  select r.settings into v_settings from public.rooms r where r.id = v_room;
  v_settings := coalesce(v_settings, '{}'::jsonb);
  v_survived := coalesce(v_state.rounds_survived, 0);
  v_current_round := v_survived + 1;

  v_a2 := coalesce((v_settings->>'enableAbility2')::bool, true);
  v_a3 := coalesce((v_settings->>'enableAbility3')::bool, true);
  v_a4 := coalesce((v_settings->>'enableAbility4')::bool, true);
  v_l2 := case when v_a2 then coalesce((v_settings->>'level2Rounds')::int, 2) else 999999 end;
  v_l3 := case when v_a3 then coalesce((v_settings->>'level3Rounds')::int, 3) else 999999 end;
  v_l4 := case when v_a4 then coalesce((v_settings->>'level4Rounds')::int, 4) else 999999 end;

  v_effective_level := case
    when v_current_round >= v_l4 then 4
    when v_current_round >= v_l3 then 3
    when v_current_round >= v_l2 then 2
    else 1
  end;

  if v_effective_level < p_min_level then
    raise exception 'level too low: have %, need %', v_effective_level, p_min_level;
  end if;

  my_player_id := v_player;
  room_id := v_room;
  level := v_effective_level;
  return next;
end $$;

notify pgrst, 'reload schema';
