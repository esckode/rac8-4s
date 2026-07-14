-- Migration 054: Player Personalization P9 — per-event notify prefs + quiet hours
--
-- Extends player_settings (052) with three independent, global toggles (one
-- per push-triggering event class) and an optional quiet-hours window,
-- evaluated in the player's own tz (P1a). All default to the always-on,
-- no-quiet-hours state so existing players see no behavior change until
-- they opt into narrowing notifications.

ALTER TABLE public.player_settings
  ADD COLUMN IF NOT EXISTS notify_mentions BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_polls BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_nudges BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quiet_hours_start SMALLINT NULL
    CHECK (quiet_hours_start IS NULL OR quiet_hours_start BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS quiet_hours_end SMALLINT NULL
    CHECK (quiet_hours_end IS NULL OR quiet_hours_end BETWEEN 0 AND 23);
