-- Make player_id nullable in group_memberships to support team-based groups
-- First, drop the primary key constraint
ALTER TABLE public.group_memberships
DROP CONSTRAINT group_memberships_pkey;

-- Now make player_id nullable
ALTER TABLE public.group_memberships
ALTER COLUMN player_id DROP NOT NULL;

-- Add an id column as the new primary key
ALTER TABLE public.group_memberships
ADD COLUMN id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text);
