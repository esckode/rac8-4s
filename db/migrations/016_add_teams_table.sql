-- Phase 1.1: Create Teams Table
-- Supports doubles tournaments with player pairs

CREATE TABLE IF NOT EXISTS public.teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES public.tournaments(id),
  player1_id TEXT NOT NULL REFERENCES public.players(id),
  player2_id TEXT NOT NULL REFERENCES public.players(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(tournament_id, player1_id, player2_id),
  CONSTRAINT different_players CHECK (player1_id != player2_id)
);

CREATE INDEX IF NOT EXISTS idx_teams_tournament ON public.teams(tournament_id);
CREATE INDEX IF NOT EXISTS idx_teams_player1 ON public.teams(player1_id);
CREATE INDEX IF NOT EXISTS idx_teams_player2 ON public.teams(player2_id);
