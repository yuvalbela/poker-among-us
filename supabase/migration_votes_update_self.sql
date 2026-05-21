-- Allow a voter to UPDATE their own vote (so they can change their pick).
-- Existing setup likely had only an INSERT policy.

drop policy if exists "votes_update_self" on public.votes;
create policy "votes_update_self" on public.votes
  for update to authenticated using (
    voter_player_id in (
      select id from public.players where user_id = auth.uid()
    )
  ) with check (
    voter_player_id in (
      select id from public.players where user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
