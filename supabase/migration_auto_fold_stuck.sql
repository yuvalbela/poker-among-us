-- ============================================================
-- Server-side enforcement of the per-turn timer.
--
-- Background: previously the turn timer was a setInterval on the
-- current player's own browser; auto-fold only fired if they were
-- still online. If they disconnected, the round stalled forever.
--
-- Now ANY client in the room can call auto_fold_stuck_player. The
-- function:
--   1. Reads the round + room settings server-side.
--   2. Confirms the timer is actually expired (+ a small grace).
--   3. Marks the stuck player's hand as folded.
--   4. Advances current_turn_index to the next active seat.
--   5. If only one active player remains, ends the round and
--      atomically transfers the pot to them (win_reason='fold').
-- ============================================================

create or replace function public.auto_fold_stuck_player(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round    record;
  v_settings jsonb;
  v_timer    int;
  v_grace    int := 5;       -- seconds of grace before we accept "expired"
  v_elapsed  int;
  v_stuck    record;
  v_active_count int;
  v_winner   record;
  v_n_hands  int;
  v_next_seat int;
begin
  -- Round + room settings
  select gr.*, r.settings as r_settings
    into v_round
    from public.game_rounds gr
    join public.rooms r on r.id = gr.room_id
   where gr.id = p_round_id;
  if not found then return; end if;
  if v_round.phase in ('showdown', 'finished') then return; end if;
  if v_round.turn_started_at is null then return; end if;

  v_settings := coalesce(v_round.r_settings, '{}'::jsonb);
  v_timer := coalesce((v_settings->>'playerTimerSeconds')::int, 0);
  if v_timer <= 0 then return; end if;  -- feature disabled

  v_elapsed := extract(epoch from (now() - v_round.turn_started_at))::int;
  if v_elapsed < v_timer + v_grace then return; end if;  -- not yet

  -- The player whose turn it is, and who must still be active
  select * into v_stuck
    from public.player_hands
   where round_id = p_round_id
     and seat_index = v_round.current_turn_index
     and status = 'active'
   limit 1;
  if not found then return; end if;

  -- Fold them
  update public.player_hands set status = 'folded' where id = v_stuck.id;

  -- Record the action so the audit log + closer-tracking stay sane
  insert into public.game_actions (round_id, player_id, phase, action, amount)
  values (p_round_id, v_stuck.player_id, v_round.phase, 'fold', 0);

  -- How many active hands remain?
  select count(*) into v_active_count
    from public.player_hands
   where round_id = p_round_id and status = 'active';

  if v_active_count = 0 then
    -- Everyone is folded or all-in. Try to find a not-folded hand to award the pot.
    select ph.*, p.name as p_name
      into v_winner
      from public.player_hands ph
      join public.players p on p.id = ph.player_id
     where ph.round_id = p_round_id and ph.status <> 'folded'
     limit 1;
    if found then
      perform public.adjust_player_chips(v_winner.player_id, v_round.pot);
      update public.game_rounds set
        phase = 'finished',
        ended_at = now(),
        winner_name = v_winner.p_name,
        win_reason = 'fold'
      where id = p_round_id;
    end if;
    return;
  end if;

  if v_active_count = 1 then
    -- One survivor — fold-win. Award pot atomically.
    select ph.*, p.name as p_name
      into v_winner
      from public.player_hands ph
      join public.players p on p.id = ph.player_id
     where ph.round_id = p_round_id and ph.status = 'active'
     limit 1;
    perform public.adjust_player_chips(v_winner.player_id, v_round.pot);
    update public.game_rounds set
      phase = 'finished',
      ended_at = now(),
      winner_name = v_winner.p_name,
      win_reason = 'fold'
    where id = p_round_id;
    return;
  end if;

  -- Two or more active — advance to next active seat
  select count(*) into v_n_hands from public.player_hands where round_id = p_round_id;
  v_next_seat := null;
  for i in 1..v_n_hands loop
    if exists (
      select 1 from public.player_hands
      where round_id = p_round_id
        and seat_index = ((v_round.current_turn_index + i) % v_n_hands)
        and status = 'active'
    ) then
      v_next_seat := (v_round.current_turn_index + i) % v_n_hands;
      exit;
    end if;
  end loop;

  if v_next_seat is not null then
    update public.game_rounds set
      current_turn_index = v_next_seat,
      turn_started_at = now()
    where id = p_round_id;
  end if;
end;
$$;

grant execute on function public.auto_fold_stuck_player(uuid) to authenticated;

notify pgrst, 'reload schema';
