-- Phase 1.4: Extend knockout_matches with team columns
-- Makes knockout_matches polymorphic: supports singles (player1/player2) OR doubles (team1/team2)

ALTER TABLE public.knockout_matches
ADD COLUMN IF NOT EXISTS team1_id TEXT REFERENCES public.teams(id);

ALTER TABLE public.knockout_matches
ADD COLUMN IF NOT EXISTS team2_id TEXT REFERENCES public.teams(id);

-- Constraint: must have EITHER (player1_id, player2_id) OR (team1_id, team2_id)
-- Allows byes where both players are NULL and both teams are NULL
-- Only add constraint if it doesn't exist
DO $$
DECLARE
  constraint_exists BOOLEAN;
BEGIN
  -- Check if constraint already exists
  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'knockout_matches'
    AND constraint_name = 'check_knockout_match_type'
  ) INTO constraint_exists;

  IF NOT constraint_exists THEN
    ALTER TABLE public.knockout_matches
    ADD CONSTRAINT check_knockout_match_type
    CHECK (
      -- Team columns must both be NULL or both be NOT NULL (no partial fill)
      ((team1_id IS NULL AND team2_id IS NULL) OR (team1_id IS NOT NULL AND team2_id IS NOT NULL))
      AND
      -- If teams are filled, players must both be NULL
      (team1_id IS NULL OR (player1_id IS NULL AND player2_id IS NULL))
    );
  END IF;
END $$;

-- Create indexes for team lookups
CREATE INDEX IF NOT EXISTS idx_knockout_matches_team1 ON public.knockout_matches(team1_id);
CREATE INDEX IF NOT EXISTS idx_knockout_matches_team2 ON public.knockout_matches(team2_id);
