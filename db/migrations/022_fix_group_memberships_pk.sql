-- Fix group_memberships primary key to support both player and team membership
-- Drop the current primary key and recreate with a generated ID

ALTER TABLE public.group_memberships
ADD COLUMN IF NOT EXISTS id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text);

-- Drop old primary key constraint if it exists
ALTER TABLE public.group_memberships
DROP CONSTRAINT IF EXISTS group_memberships_pkey;

-- Add unique constraints for each membership type
ALTER TABLE public.group_memberships
ADD CONSTRAINT unique_group_player UNIQUE (group_id, player_id) WHERE player_id IS NOT NULL;

ALTER TABLE public.group_memberships
ADD CONSTRAINT unique_group_team UNIQUE (group_id, team_id) WHERE team_id IS NOT NULL;
