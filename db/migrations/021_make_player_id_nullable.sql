-- Make player_id nullable in group_memberships to support team-based groups
ALTER TABLE public.group_memberships
ALTER COLUMN player_id DROP NOT NULL;
