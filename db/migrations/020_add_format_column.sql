-- Add format column to group_matches
ALTER TABLE public.group_matches
ADD COLUMN format VARCHAR(20) NOT NULL DEFAULT 'singles';

-- Add constraint to enforce valid formats
ALTER TABLE public.group_matches
ADD CONSTRAINT check_group_matches_format
CHECK (format IN ('singles', 'doubles'));

-- Migrate existing matches to explicit format=singles
UPDATE public.group_matches
SET format = 'singles'
WHERE format = 'singles';

-- Create partial indexes for singles (exclude NULL player columns)
CREATE INDEX idx_group_matches_singles_player1
ON public.group_matches(player1_id)
WHERE format = 'singles' AND player1_id IS NOT NULL;

CREATE INDEX idx_group_matches_singles_player2
ON public.group_matches(player2_id)
WHERE format = 'singles' AND player2_id IS NOT NULL;

-- Create partial indexes for doubles (exclude NULL team columns)
CREATE INDEX idx_group_matches_doubles_team1
ON public.group_matches(team1_id)
WHERE format = 'doubles' AND team1_id IS NOT NULL;

CREATE INDEX idx_group_matches_doubles_team2
ON public.group_matches(team2_id)
WHERE format = 'doubles' AND team2_id IS NOT NULL;

-- Same for knockout_matches
ALTER TABLE public.knockout_matches
ADD COLUMN format VARCHAR(20) NOT NULL DEFAULT 'singles';

ALTER TABLE public.knockout_matches
ADD CONSTRAINT check_knockout_matches_format
CHECK (format IN ('singles', 'doubles'));

UPDATE public.knockout_matches
SET format = 'singles'
WHERE format = 'singles';

CREATE INDEX idx_knockout_matches_singles_player1
ON public.knockout_matches(player1_id)
WHERE format = 'singles' AND player1_id IS NOT NULL;

CREATE INDEX idx_knockout_matches_singles_player2
ON public.knockout_matches(player2_id)
WHERE format = 'singles' AND player2_id IS NOT NULL;

CREATE INDEX idx_knockout_matches_doubles_team1
ON public.knockout_matches(team1_id)
WHERE format = 'doubles' AND team1_id IS NOT NULL;

CREATE INDEX idx_knockout_matches_doubles_team2
ON public.knockout_matches(team2_id)
WHERE format = 'doubles' AND team2_id IS NOT NULL;
