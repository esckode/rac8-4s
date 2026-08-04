-- Migration 063: quiet hours become a tristate (UAT ISSUE-66)
--
-- 054 encoded "no quiet-hours window" as NULL start/end, which left no way to
-- distinguish "the player chose 8am-5pm" from "the player never touched this"
-- — and made DEFAULT_PLAYER_SETTINGS' in-memory 8/17 silently active for every
-- player without a settings row.
--
-- quiet_hours_enabled makes "off" explicit and defaults to false, restoring
-- 054's documented no-quiet-hours-by-default intent, while start/end keep the
-- suggested 8am-5pm window populated for the Profile control to display.
--
-- Backfill sets the window on rows that predate this (NULL start/end) so every
-- row can render the control; enabled=false means none of them change behavior.

ALTER TABLE public.player_settings
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false;

UPDATE public.player_settings
   SET quiet_hours_start = COALESCE(quiet_hours_start, 8),
       quiet_hours_end   = COALESCE(quiet_hours_end, 17);
