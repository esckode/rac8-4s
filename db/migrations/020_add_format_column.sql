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
-- These will be the only partial indexes until team columns are added in Phase 1.1-1.4
CREATE INDEX idx_group_matches_singles_player1 
ON public.group_matches(player1_id) 
WHERE format = 'singles' AND player1_id IS NOT NULL;

CREATE INDEX idx_group_matches_singles_player2 
ON public.group_matches(player2_id) 
WHERE format = 'singles' AND player2_id IS NOT NULL;

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
