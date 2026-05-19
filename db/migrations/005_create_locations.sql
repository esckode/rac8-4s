CREATE TABLE IF NOT EXISTS public.locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  total_courts INTEGER NOT NULL,
  restricted BOOLEAN DEFAULT FALSE,
  entry_conditions TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_locations_sport ON public.locations(sport);
CREATE INDEX IF NOT EXISTS idx_locations_coordinates ON public.locations(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_locations_created ON public.locations(created_at DESC);
