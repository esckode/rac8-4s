CREATE TABLE IF NOT EXISTS public.user_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  screen VARCHAR(100),
  duration INTEGER,
  data TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES public.players(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_events_user_id_created_at ON public.user_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_events_event_type ON public.user_events(event_type);
CREATE INDEX IF NOT EXISTS idx_user_events_screen ON public.user_events(screen);
