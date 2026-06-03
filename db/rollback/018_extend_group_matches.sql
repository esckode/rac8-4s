-- Rollback Phase 1.3: Remove team columns from group_matches

DROP INDEX IF EXISTS public.idx_group_matches_team2;
DROP INDEX IF EXISTS public.idx_group_matches_team1;

-- Drop constraint if it exists
ALTER TABLE public.group_matches
DROP CONSTRAINT IF EXISTS check_match_type;

-- Drop the columns
ALTER TABLE public.group_matches
DROP COLUMN IF EXISTS team2_id;

ALTER TABLE public.group_matches
DROP COLUMN IF EXISTS team1_id;
