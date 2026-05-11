CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  preferred_contact TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_registrations (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  registered_at TEXT NOT NULL,
  UNIQUE(player_id, tournament_id)
);

CREATE INDEX IF NOT EXISTS idx_registrations_player ON player_registrations(player_id);
CREATE INDEX IF NOT EXISTS idx_registrations_tournament ON player_registrations(tournament_id);
