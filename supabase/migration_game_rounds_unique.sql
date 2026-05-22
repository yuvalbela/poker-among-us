-- ROOT CAUSE: game_rounds had only an index on (room_id, round_number), not a
-- UNIQUE constraint. Double-clicking "Start Game" (or "Next Round") could create
-- two rows with the same round_number, and clients would non-deterministically
-- pick one or the other when fetching "latest round" — manifesting as cards
-- and community cards "changing" mid-round for some players.
--
-- This migration:
--   1) deletes any existing duplicates, keeping the earliest-inserted row
--      (older row is what most clients latched onto first, so least disruptive)
--   2) adds a UNIQUE constraint so future double-inserts fail loudly

-- Step 1 — dedupe. Delete rows where a sibling with the same (room_id, round_number)
-- has an EARLIER created_at.
delete from public.game_rounds gr
using public.game_rounds older
where gr.room_id = older.room_id
  and gr.round_number = older.round_number
  and gr.id <> older.id
  and older.created_at < gr.created_at;

-- Step 2 — enforce uniqueness going forward.
alter table public.game_rounds
  drop constraint if exists game_rounds_room_round_unique;
alter table public.game_rounds
  add constraint game_rounds_room_round_unique unique (room_id, round_number);

notify pgrst, 'reload schema';
