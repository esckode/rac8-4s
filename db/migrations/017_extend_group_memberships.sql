-- Phase 1.2: Extend group_memberships with team_id
-- Makes group_memberships polymorphic: supports player OR team

ALTER TABLE public.group_memberships
ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES public.teams(id);

-- Constraint: must have EITHER player_id OR team_id, never both
-- Only add constraint if it doesn't exist
DO $$
DECLARE
  constraint_exists BOOLEAN;
BEGIN
  -- Check if constraint already exists
  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'group_memberships'
    AND constraint_name = 'check_membership_type'
  ) INTO constraint_exists;

  IF NOT constraint_exists THEN
    ALTER TABLE public.group_memberships
    ADD CONSTRAINT check_membership_type
    CHECK (
      (player_id IS NOT NULL AND team_id IS NULL) OR
      (player_id IS NULL AND team_id IS NOT NULL)
    );
  END IF;
END $$;

-- Create index for team lookups
CREATE INDEX IF NOT EXISTS idx_group_memberships_team ON public.group_memberships(team_id);
