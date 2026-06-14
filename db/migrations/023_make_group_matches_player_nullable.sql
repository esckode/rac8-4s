-- Make player1_id and player2_id nullable in group_matches for doubles tournament support
-- This allows team-based matches where players are NULL and teams are populated instead

ALTER TABLE public.group_matches
ALTER COLUMN player1_id DROP NOT NULL;

ALTER TABLE public.group_matches
ALTER COLUMN player2_id DROP NOT NULL;
