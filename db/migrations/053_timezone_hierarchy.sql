-- Migration 053: Player Personalization P1 — timezone hierarchy
--
-- Three levels: player (player_settings.timezone, already added in 052),
-- group (player_groups.group_timezone — owner-pinnable override; the
-- majority-derived effective tz is computed at read time, not stored), and
-- venue (locations.timezone — set by the organizer with the venue; NULL
-- falls back to the group's effective tz for group-linked casual sessions).
-- No timezone column existed anywhere before this; pre-launch, no backfill.

ALTER TABLE public.player_groups
  ADD COLUMN IF NOT EXISTS group_timezone TEXT NULL;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS timezone TEXT NULL;
