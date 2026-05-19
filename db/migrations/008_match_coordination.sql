ALTER TABLE public.players ADD COLUMN IF NOT EXISTS share_contact BOOLEAN DEFAULT false;

ALTER TABLE public.group_matches ADD COLUMN IF NOT EXISTS player1_confirmed BOOLEAN DEFAULT false;
ALTER TABLE public.group_matches ADD COLUMN IF NOT EXISTS player2_confirmed BOOLEAN DEFAULT false;
ALTER TABLE public.group_matches ADD COLUMN IF NOT EXISTS player1_confirmed_at TIMESTAMP;
ALTER TABLE public.group_matches ADD COLUMN IF NOT EXISTS player2_confirmed_at TIMESTAMP;

ALTER TABLE public.knockout_matches ADD COLUMN IF NOT EXISTS player1_confirmed BOOLEAN DEFAULT false;
ALTER TABLE public.knockout_matches ADD COLUMN IF NOT EXISTS player2_confirmed BOOLEAN DEFAULT false;
ALTER TABLE public.knockout_matches ADD COLUMN IF NOT EXISTS player1_confirmed_at TIMESTAMP;
ALTER TABLE public.knockout_matches ADD COLUMN IF NOT EXISTS player2_confirmed_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_group_matches_player1 ON public.group_matches(tournament_id, player1_id);
CREATE INDEX IF NOT EXISTS idx_group_matches_player2 ON public.group_matches(tournament_id, player2_id);
CREATE INDEX IF NOT EXISTS idx_knockout_matches_player1 ON public.knockout_matches(tournament_id, player1_id);
CREATE INDEX IF NOT EXISTS idx_knockout_matches_player2 ON public.knockout_matches(tournament_id, player2_id);
