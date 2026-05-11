CREATE TABLE IF NOT EXISTS courts (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id),
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'unavailable', 'maintenance')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_courts_location ON courts(location_id);
CREATE INDEX IF NOT EXISTS idx_courts_status ON courts(location_id, status);
