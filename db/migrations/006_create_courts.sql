CREATE TABLE IF NOT EXISTS public.courts (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES public.locations(id),
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'unavailable', 'maintenance')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courts_location ON public.courts(location_id);
CREATE INDEX IF NOT EXISTS idx_courts_status ON public.courts(location_id, status);
