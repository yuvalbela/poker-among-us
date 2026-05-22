-- ============================================================
-- Three audit fixes bundled into one migration.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- (1) Atomic chip adjustment — replaces the read-modify-write
--     pattern in takeAction/doShowdown/finishOneWinner with a
--     single SQL statement so concurrent updates can't clobber
--     each other.
-- ──────────────────────────────────────────────────────────
create or replace function public.adjust_player_chips(
  p_player_id uuid,
  p_delta int
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.players
     set chips = greatest(0, chips + p_delta)
   where id = p_player_id;
$$;

grant execute on function public.adjust_player_chips(uuid, int) to authenticated;

-- ──────────────────────────────────────────────────────────
-- (2) Tighten hole_cards RLS:
--     - Owner can always see their own cards (unchanged).
--     - At showdown/finished, hole cards become visible to the room
--       ONLY if (a) the round didn't end by fold AND (b) this hand
--       didn't fold itself. Otherwise the cards stay hidden, which
--       matches the poker convention that a fold-winner doesn't
--       have to show, and folded hands aren't revealed at showdown.
-- ──────────────────────────────────────────────────────────
drop policy if exists "hole_cards_select_owner_or_showdown" on public.player_hole_cards;
create policy "hole_cards_select_owner_or_showdown" on public.player_hole_cards
  for select to authenticated using (
    exists (
      select 1 from public.player_hands ph
      join public.players p on p.id = ph.player_id
      where ph.id = player_hole_cards.player_hand_id
        and p.user_id = auth.uid()
    )
    or exists (
      select 1 from public.player_hands ph
      join public.game_rounds gr on gr.id = ph.round_id
      where ph.id = player_hole_cards.player_hand_id
        and gr.phase in ('showdown', 'finished')
        and coalesce(gr.win_reason, '') <> 'fold'
        and ph.status <> 'folded'
    )
  );

-- ──────────────────────────────────────────────────────────
-- (3) UNIQUE on votes (room_id, round_number, voter_player_id).
--     First dedupe any historical duplicates (keep oldest by created_at).
-- ──────────────────────────────────────────────────────────
delete from public.votes v
using public.votes older
where v.room_id = older.room_id
  and v.round_number = older.round_number
  and v.voter_player_id = older.voter_player_id
  and v.id <> older.id
  and older.created_at < v.created_at;

alter table public.votes
  drop constraint if exists votes_room_round_voter_unique;
alter table public.votes
  add constraint votes_room_round_voter_unique
  unique (room_id, round_number, voter_player_id);

notify pgrst, 'reload schema';
