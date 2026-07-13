-- Migration 052: Player Personalization — P0 preferences store
--
-- One row per player, typed columns with CHECKs (chosen over columns-on-players
-- or JSONB — design PERSONALIZATION_DESIGN.md §P0). player_id is both PK and
-- FK so ON DELETE CASCADE is the entire DSR-erasure story for this table.
-- Lazily upserted on first PATCH /api/auth/me/settings; defaults served when
-- absent (no row created on player signup).

CREATE TABLE IF NOT EXISTS public.player_settings (
  player_id TEXT PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  timezone TEXT NULL,
  timezone_manual BOOLEAN NOT NULL DEFAULT false,
  table_density TEXT NOT NULL DEFAULT 'comfortable'
    CHECK (table_density IN ('comfortable', 'compact')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
