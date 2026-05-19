CREATE TABLE IF NOT EXISTS public.groups (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES public.tournaments(id),
  name TEXT NOT NULL,
  advancing_count INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.group_memberships (
  group_id TEXT NOT NULL REFERENCES public.groups(id),
  player_id TEXT NOT NULL REFERENCES public.players(id),
  PRIMARY KEY (group_id, player_id)
);

CREATE TABLE IF NOT EXISTS public.group_matches (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES public.groups(id),
  tournament_id TEXT NOT NULL REFERENCES public.tournaments(id),
  player1_id TEXT NOT NULL REFERENCES public.players(id),
  player2_id TEXT NOT NULL REFERENCES public.players(id),
  winner_id TEXT REFERENCES public.players(id),
  score TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','walkover')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_tournament ON public.groups(tournament_id);
CREATE INDEX IF NOT EXISTS idx_group_matches_group ON public.group_matches(group_id);
CREATE INDEX IF NOT EXISTS idx_group_matches_tournament ON public.group_matches(tournament_id);
