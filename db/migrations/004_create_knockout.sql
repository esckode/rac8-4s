CREATE TABLE IF NOT EXISTS bracket_seeds (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  seed_position INTEGER NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  PRIMARY KEY (tournament_id, seed_position)
);

CREATE TABLE IF NOT EXISTS knockout_matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  round INTEGER NOT NULL,
  position INTEGER NOT NULL,
  player1_id TEXT REFERENCES players(id),
  player2_id TEXT REFERENCES players(id),
  winner_id TEXT REFERENCES players(id),
  score TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','bye')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bracket_seeds_tournament ON bracket_seeds(tournament_id);
CREATE INDEX IF NOT EXISTS idx_knockout_matches_tournament ON knockout_matches(tournament_id);
