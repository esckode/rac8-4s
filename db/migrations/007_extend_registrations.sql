-- Add partner_id column if it doesn't exist
ALTER TABLE player_registrations ADD COLUMN partner_id TEXT REFERENCES players(id);

-- Add partner_confirmed column if it doesn't exist
ALTER TABLE player_registrations ADD COLUMN partner_confirmed BOOLEAN DEFAULT 0;

-- Add status column if it doesn't exist
ALTER TABLE player_registrations ADD COLUMN status TEXT DEFAULT 'registered' CHECK(status IN ('registered', 'pending_partner_confirm', 'withdrawn', 'withdrawal_pending'));

-- Add withdrawal_requested_at column if it doesn't exist
ALTER TABLE player_registrations ADD COLUMN withdrawal_requested_at TEXT;

-- Add confirmed_at column if it doesn't exist
ALTER TABLE player_registrations ADD COLUMN confirmed_at TEXT;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_registrations_status ON player_registrations(tournament_id, status);
