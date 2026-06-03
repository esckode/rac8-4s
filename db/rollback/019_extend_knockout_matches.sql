-- Rollback Phase 1.4: Remove team columns from knockout_matches

DROP INDEX IF EXISTS public.idx_knockout_matches_team2;
DROP INDEX IF EXISTS public.idx_knockout_matches_team1;

-- Drop constraint if it exists
ALTER TABLE public.knockout_matches
DROP CONSTRAINT IF EXISTS check_knockout_match_type;

-- Drop the columns
ALTER TABLE public.knockout_matches
DROP COLUMN IF EXISTS team2_id;

ALTER TABLE public.knockout_matches
DROP COLUMN IF EXISTS team1_id;
