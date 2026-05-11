ALTER TABLE players ADD COLUMN share_contact BOOLEAN DEFAULT 0;

ALTER TABLE group_matches ADD COLUMN player1_confirmed BOOLEAN DEFAULT 0;
ALTER TABLE group_matches ADD COLUMN player2_confirmed BOOLEAN DEFAULT 0;
ALTER TABLE group_matches ADD COLUMN player1_confirmed_at TEXT;
ALTER TABLE group_matches ADD COLUMN player2_confirmed_at TEXT;

ALTER TABLE knockout_matches ADD COLUMN player1_confirmed BOOLEAN DEFAULT 0;
ALTER TABLE knockout_matches ADD COLUMN player2_confirmed BOOLEAN DEFAULT 0;
ALTER TABLE knockout_matches ADD COLUMN player1_confirmed_at TEXT;
ALTER TABLE knockout_matches ADD COLUMN player2_confirmed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_group_matches_player1 ON group_matches(tournament_id, player1_id);
CREATE INDEX IF NOT EXISTS idx_group_matches_player2 ON group_matches(tournament_id, player2_id);
CREATE INDEX IF NOT EXISTS idx_knockout_matches_player1 ON knockout_matches(tournament_id, player1_id);
CREATE INDEX IF NOT EXISTS idx_knockout_matches_player2 ON knockout_matches(tournament_id, player2_id);
