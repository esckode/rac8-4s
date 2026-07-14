-- Migration 055: Player Personalization P11 — standings snapshots
--
-- One row per (tournament, player, iso_week) — written by the weekly digest
-- sweep just before composing, so a rank-movement line can be computed by
-- diffing against the previous week's row. Singles only in this pass: the
-- FK is to players directly, and a doubles team id has no players row of
-- its own to satisfy it (doubles snapshot support deferred, BACKLOG.md).
-- player_id FK cascade is the entire DSR-erasure story, same pattern as 052.

CREATE TABLE IF NOT EXISTS public.standings_snapshots (
  tournament_id TEXT NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  iso_week TEXT NOT NULL,
  rank INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  sets_won INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, player_id, iso_week)
);
