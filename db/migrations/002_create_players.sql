CREATE TABLE IF NOT EXISTS public.players (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  preferred_contact TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.player_registrations (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES public.players(id),
  tournament_id TEXT NOT NULL REFERENCES public.tournaments(id),
  registered_at TIMESTAMP NOT NULL,
  UNIQUE(player_id, tournament_id)
);

CREATE INDEX IF NOT EXISTS idx_registrations_player ON public.player_registrations(player_id);
CREATE INDEX IF NOT EXISTS idx_registrations_tournament ON public.player_registrations(tournament_id);
