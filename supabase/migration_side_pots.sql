-- Add a per-pot breakdown column so showdown can record multiple side pots
-- and the UI can render "Main: Alice 600 · Side 1: Bob 900 · Side 2: Alice 600".
-- Shape: [{ label: 'main' | 'side1' | ..., amount: int, winners: ['name', ...], eligible_count: int, hand_category: text|null }]

alter table public.game_rounds
  add column if not exists pot_breakdown jsonb;

notify pgrst, 'reload schema';
