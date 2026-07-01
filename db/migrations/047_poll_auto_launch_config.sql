-- Migration 047: poll auto-launch config fields
--
-- P3.2 — Poll auto-launch config schema (B-POLLCFG)
--
-- Adds four optional columns to messaging.polls that drive the P3.3 auto-close
-- sweep and P3.4 auto-launch hook:
--
--   auto_close_at        — when set, the P3.3 sweep closes this poll automatically
--   auto_launch          — if true and auto_close fires, attempt to launch a tournament
--   min_players          — minimum "in" votes needed to launch; NULL = no threshold
--   launch_match_format  — match format to use on auto-launch; NULL = group default
--
-- Existing polls are unaffected: all new columns default to NULL / false.
-- All timestamps: TIMESTAMPTZ only (UTC-everywhere per CLAUDE.md §7).

ALTER TABLE messaging.polls
  ADD COLUMN IF NOT EXISTS auto_close_at       TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS auto_launch         BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_players         INT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS launch_match_format TEXT        DEFAULT NULL;

-- Index to support the P3.3 auto-close sweep (polls due for close)
CREATE INDEX IF NOT EXISTS idx_polls_auto_close_at
  ON messaging.polls (auto_close_at)
  WHERE auto_close_at IS NOT NULL AND closed_at IS NULL;
