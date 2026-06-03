-- Rollback Phase 1.2: Remove team_id from group_memberships

DROP INDEX IF EXISTS public.idx_group_memberships_team;

-- Drop constraint if it exists
ALTER TABLE public.group_memberships
DROP CONSTRAINT IF EXISTS check_membership_type;

-- Drop the column
ALTER TABLE public.group_memberships
DROP COLUMN IF EXISTS team_id;
