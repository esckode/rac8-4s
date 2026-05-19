CREATE TABLE IF NOT EXISTS public.bracket_seeds (
  tournament_id TEXT NOT NULL REFERENCES public.tournaments(id),
  seed_position INTEGER NOT NULL,
  player_id TEXT NOT NULL REFERENCES public.players(id),
  PRIMARY KEY (tournament_id, seed_position)
);

CREATE TABLE IF NOT EXISTS public.knockout_matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES public.tournaments(id),
  round INTEGER NOT NULL,
  position INTEGER NOT NULL,
  player1_id TEXT REFERENCES public.players(id),
  player2_id TEXT REFERENCES public.players(id),
  winner_id TEXT REFERENCES public.players(id),
  score TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','bye')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bracket_seeds_tournament ON public.bracket_seeds(tournament_id);
CREATE INDEX IF NOT EXISTS idx_knockout_matches_tournament ON public.knockout_matches(tournament_id);
