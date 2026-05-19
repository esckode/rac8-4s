CREATE TABLE IF NOT EXISTS public.tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  match_format TEXT NOT NULL CHECK(match_format IN ('singles','doubles')),
  creator_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  max_players INTEGER NOT NULL,
  description TEXT,
  registration_deadline TIMESTAMP NOT NULL,
  group_stage_deadline TIMESTAMP NOT NULL,
  knockout_stage_deadline TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tournaments_creator ON public.tournaments(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_tournaments_public ON public.tournaments(status, created_at);
