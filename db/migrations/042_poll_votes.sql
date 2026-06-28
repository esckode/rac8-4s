-- Migration 042: poll_votes table for group availability polls
--
-- G3.1 — Poll backend: In/Out/Maybe, re-votable, notify-on-create
--
-- A poll is a type=poll group message (messaging.group_messages) carrying
-- question + target time in its body (JSON). This table stores the votes
-- per player per poll.
--
-- Design decisions:
--   - choice stored as TEXT (extensible per §11.8) — not three booleans,
--     not a fixed enum. Current valid values: 'in', 'out', 'maybe'.
--     Future values can be added without a schema change.
--   - One row per (message_id, player_id) — UPSERT on vote replaces the
--     prior choice (re-votable; latest vote wins).
--   - player_id is NULLABLE for §0.5 erasure: anonymizePollVotesFor(playerId)
--     deletes the row entirely (the vote itself is PII; no tombstone needed
--     since the tally is derived at query time).
--   - voted_at is TIMESTAMPTZ only (UTC-everywhere per CLAUDE.md §7).
--
-- message_id references messaging.group_messages.id (the poll message).
-- No cross-schema FK declared (mirrors messaging.group_messages precedent —
-- cross-schema FKs complicate partition maintenance).
--
-- All timestamps: TIMESTAMPTZ only.

CREATE TABLE IF NOT EXISTS messaging.poll_votes (
  message_id   UUID        NOT NULL,
  player_id    TEXT,
  choice       TEXT        NOT NULL
                           CHECK (choice IN ('in', 'out', 'maybe')),
  voted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One row per (poll message, player) so an upsert replaces the prior vote.
  CONSTRAINT poll_votes_pkey PRIMARY KEY (message_id, player_id)
);

-- Index for tally queries by message_id
CREATE INDEX IF NOT EXISTS idx_poll_votes_message_id
  ON messaging.poll_votes (message_id);

-- Table to store poll metadata (question + target_time) linked to the message
CREATE TABLE IF NOT EXISTS messaging.polls (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id   UUID        NOT NULL UNIQUE
                           REFERENCES messaging.group_messages(id),
  question     TEXT        NOT NULL,
  target_time  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
