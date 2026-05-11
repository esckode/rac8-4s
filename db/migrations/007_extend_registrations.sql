ALTER TABLE player_registrations ADD COLUMN partner_id TEXT REFERENCES players(id);
ALTER TABLE player_registrations ADD COLUMN partner_confirmed BOOLEAN DEFAULT 0;
ALTER TABLE player_registrations ADD COLUMN status TEXT DEFAULT 'registered' CHECK(status IN ('registered', 'pending_partner_confirm', 'withdrawn', 'withdrawal_pending'));
ALTER TABLE player_registrations ADD COLUMN withdrawal_requested_at TEXT;
ALTER TABLE player_registrations ADD COLUMN confirmed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_registrations_status ON player_registrations(tournament_id, status);
