CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  total_courts INTEGER NOT NULL,
  restricted BOOLEAN DEFAULT FALSE,
  entry_conditions TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_locations_sport ON locations(sport);
CREATE INDEX IF NOT EXISTS idx_locations_coordinates ON locations(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_locations_created ON locations(created_at DESC);
