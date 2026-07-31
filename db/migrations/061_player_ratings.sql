-- Migration 061: Skill Ratings (P13)
--
-- Two tables:
-- 1. player_ratings — current skill rating per player/sport/format
--    PK: (player_id, sport, format)
--    matches_played is load-bearing for K-decay in Phase 2
--
-- 2. player_rating_history — append-only audit trail
--    Never overwrites: R17 correction logic depends on finding the LATEST
--    row (by created_at) for a given match_id to apply the correction delta.
--    Do NOT add UNIQUE (player_id, match_id) — it would force overwrite-in-place
--    and destroy both the audit trail and the correction mechanism.

CREATE TABLE IF NOT EXISTS public.player_ratings (
  player_id TEXT NOT NULL,
  sport TEXT NOT NULL,
  format TEXT NOT NULL,
  rating NUMERIC NOT NULL,
  matches_played INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (player_id, sport, format),
  FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.player_rating_history (
  id BIGSERIAL PRIMARY KEY,
  player_id TEXT NOT NULL,
  sport TEXT NOT NULL,
  format TEXT NOT NULL,
  delta NUMERIC NOT NULL,
  rating_after NUMERIC NOT NULL,
  match_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_player_rating_history_player_match
  ON public.player_rating_history(player_id, match_id);

CREATE INDEX IF NOT EXISTS idx_player_rating_history_sport_format_time
  ON public.player_rating_history(player_id, sport, format, created_at);
