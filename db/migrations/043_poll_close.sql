-- Migration 043: poll close support
--
-- G3.2 — Poll auto-close + system follow-up
--
-- Adds closed_at to messaging.polls so that a poll can be closed
-- (manually or by a scheduler in the future). When closed_at IS NOT NULL:
--   - Votes are rejected (409 POLL_CLOSED).
--   - Tally is frozen (history still shows the last tally at close time).
--   - A system message with the final tally summary was already posted
--     at close time by closePoll().
--
-- All timestamps: TIMESTAMPTZ only (UTC-everywhere per CLAUDE.md §7).

ALTER TABLE messaging.polls
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ DEFAULT NULL;

-- creator_player_id: needed to enforce "only creator or group owner can close"
-- without a separate join to the originating group_messages row.
ALTER TABLE messaging.polls
  ADD COLUMN IF NOT EXISTS creator_player_id TEXT DEFAULT NULL;

-- Backfill creator_player_id from the linked group_message's player_id.
-- For existing polls this is always set (NULL player_id would mean a system poll,
-- which does not exist yet). Backfill is best-effort for existing rows.
UPDATE messaging.polls p
SET creator_player_id = gm.player_id
FROM messaging.group_messages gm
WHERE p.message_id = gm.id
  AND p.creator_player_id IS NULL;
