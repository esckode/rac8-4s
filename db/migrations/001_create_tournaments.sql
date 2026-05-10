CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  match_format TEXT NOT NULL CHECK(match_format IN ('singles','doubles')),
  creator_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  max_players INTEGER NOT NULL,
  description TEXT,
  registration_deadline TEXT NOT NULL,
  group_stage_deadline TEXT NOT NULL,
  knockout_stage_deadline TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tournaments_creator ON tournaments(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_tournaments_public  ON tournaments(status, created_at);
