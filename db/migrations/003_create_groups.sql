CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  name TEXT NOT NULL,
  advancing_count INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_memberships (
  group_id TEXT NOT NULL REFERENCES groups(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  PRIMARY KEY (group_id, player_id)
);

CREATE TABLE IF NOT EXISTS group_matches (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  player1_id TEXT NOT NULL REFERENCES players(id),
  player2_id TEXT NOT NULL REFERENCES players(id),
  winner_id TEXT REFERENCES players(id),
  score TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','walkover')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_groups_tournament ON groups(tournament_id);
CREATE INDEX IF NOT EXISTS idx_group_matches_group ON group_matches(group_id);
CREATE INDEX IF NOT EXISTS idx_group_matches_tournament ON group_matches(tournament_id);
