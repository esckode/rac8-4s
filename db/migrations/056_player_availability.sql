-- Migration 056: Player Personalization P12 — availability
--
-- A row = "I'm free this weekday/day-part" (existence, not a boolean column).
-- PUT /api/auth/me/availability does a full-grid replace: delete all of the
-- caller's rows, then insert one per selected slot. player_id FK cascade is
-- the entire DSR-erasure story, same pattern as 052/055.
--
-- availability_updated_at lives on player_settings (052) rather than being
-- derived from player_availability's own rows, because a valid state is
-- "free at zero slots" — which would leave no row to read a timestamp from.

CREATE TABLE IF NOT EXISTS public.player_availability (
  player_id TEXT NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  day_part TEXT NOT NULL CHECK (day_part IN ('morning', 'afternoon', 'evening')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, weekday, day_part)
);

ALTER TABLE public.player_settings
  ADD COLUMN IF NOT EXISTS availability_updated_at TIMESTAMPTZ NULL;
