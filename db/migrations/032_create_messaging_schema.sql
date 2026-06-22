-- 032: create messaging schema with partitioned tables.
--
-- Design decisions:
--   - RANGE-partitioned on created_at (messages) / message_created_at (recipients)
--     so monthly partition pruning works for time-range queries.
--   - PK on messages is (id, created_at) — Postgres requires the partition key
--     in every unique constraint on a partitioned table.
--   - message_recipients carries message_created_at (denormalized) so the
--     composite FK (message_id, message_created_at) → messages(id, created_at)
--     can be declared; cross-partition foreign keys are unsupported in PG 15.
--   - All timestamps are TIMESTAMPTZ (UTC everywhere; avoids the deadline bug
--     fixed by migrations 025 and 031).
--   - id is UUID (gen_random_uuid()) for new tables in the messaging schema.
--   - tournament_id, sender_player_id, recipient_player_id, match_id are TEXT
--     to match the existing public schema PK types (public.tournaments.id etc.
--     are TEXT, not UUID).
--   - Three aligned monthly partitions are created statically (2026-06, 2026-07,
--     2026-08). Automated future-partition creation is Phase 2.
--   - public.tournaments.completed_at TIMESTAMPTZ (nullable) tracks when a
--     tournament reached tournament_complete status.

CREATE SCHEMA IF NOT EXISTS messaging;

-- ── Parent: messaging.messages ─────────────────────────────────────────────
CREATE TABLE messaging.messages (
  id                  UUID         NOT NULL DEFAULT gen_random_uuid(),
  tournament_id       TEXT         NOT NULL,
  sender_player_id    TEXT         NOT NULL,
  recipient_player_id TEXT,
  match_id            TEXT,
  body                TEXT         NOT NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  legal_hold          BOOLEAN      NOT NULL DEFAULT false,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- ── Aligned monthly partitions for messages ────────────────────────────────
CREATE TABLE messaging.messages_2026_06
  PARTITION OF messaging.messages
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE messaging.messages_2026_07
  PARTITION OF messaging.messages
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE messaging.messages_2026_08
  PARTITION OF messaging.messages
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- ── Index: messages(tournament_id, created_at) ─────────────────────────────
CREATE INDEX idx_messages_tournament_created
  ON messaging.messages (tournament_id, created_at);

-- ── Parent: messaging.message_recipients ───────────────────────────────────
-- message_created_at is denormalized from messages so the composite FK works
-- across partitions without a cross-partition FK (unsupported in PG 15).
CREATE TABLE messaging.message_recipients (
  message_id          UUID         NOT NULL,
  message_created_at  TIMESTAMPTZ  NOT NULL,
  player_id           TEXT         NOT NULL,
  read_at             TIMESTAMPTZ,
  PRIMARY KEY (message_id, message_created_at, player_id),
  FOREIGN KEY (message_id, message_created_at)
    REFERENCES messaging.messages (id, created_at)
) PARTITION BY RANGE (message_created_at);

-- ── Aligned monthly partitions for message_recipients ─────────────────────
CREATE TABLE messaging.message_recipients_2026_06
  PARTITION OF messaging.message_recipients
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE messaging.message_recipients_2026_07
  PARTITION OF messaging.message_recipients
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE messaging.message_recipients_2026_08
  PARTITION OF messaging.message_recipients
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- ── Index: message_recipients(player_id, read_at) ─────────────────────────
CREATE INDEX idx_message_recipients_player_read
  ON messaging.message_recipients (player_id, read_at);

-- ── public.tournaments.completed_at ───────────────────────────────────────
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
