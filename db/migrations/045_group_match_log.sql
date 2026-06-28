-- Migration 045: durable match log for casual group tournaments.
-- G4.4 — Cross-tournament leaderboard foundation.
--
-- One row per finalized match; participants stored per-slot for §0.5 erasure.

CREATE TABLE public.group_match_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  TEXT        NOT NULL,
  group_id       UUID        NOT NULL REFERENCES public.player_groups(id) ON DELETE CASCADE,
  match_ref      TEXT        NOT NULL,  -- references group_matches.id
  winning_side   TEXT        NOT NULL CHECK (winning_side IN ('team1', 'team2', 'draw')),
  logged_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_ref)  -- idempotent: re-submitting same match doesn't duplicate
);

CREATE INDEX idx_group_match_log_group ON public.group_match_log(group_id);
CREATE INDEX idx_group_match_log_tournament ON public.group_match_log(tournament_id);

CREATE TABLE public.group_match_participants (
  match_log_id   UUID        NOT NULL REFERENCES public.group_match_log(id) ON DELETE CASCADE,
  slot           INT         NOT NULL,
  player_id      TEXT,               -- NULLABLE for §0.5 erasure
  name_snapshot  TEXT        NOT NULL,
  side           TEXT        NOT NULL CHECK (side IN ('team1', 'team2')),
  PRIMARY KEY (match_log_id, slot)
);

CREATE INDEX idx_group_match_participants_player ON public.group_match_participants(player_id)
  WHERE player_id IS NOT NULL;
