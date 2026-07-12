-- Migration 050: assistant_cards — Phase B confirm-card storage (design §11 B-Q2)
--
-- Dedicated table for @coach's propose_* write-action cards, mirroring the
-- messaging.polls precedent (042): widget state lives in its own table; the
-- type='assistant' group_messages row is the feed vehicle and carries only
-- {cardId} in its metadata, plus a human-readable prose summary in body
-- (the durable/export/fallback record — B-Q9).
--
-- Lifecycle (B-Q1): status IN ('pending','confirmed','failed','cancelled').
-- 'expired' is NEVER a stored state — it is computed read-side from
-- expires_at (no sweeper job, avoiding the MESSAGING_DESIGN §16 class of gap).
-- 'failed' = confirm-time revalidation rejected (reason in result);
-- 'cancelled' = proposer dismissed.
--
-- args/result are JSONB. args are ids-only (names resolved and discarded at
-- draft time — B-Q10); nothing there needs the A9.3-style name scrub.

CREATE TABLE IF NOT EXISTS messaging.assistant_cards (
  id                 UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id         UUID        NOT NULL UNIQUE
                                 REFERENCES messaging.group_messages(id),
  group_id           UUID        NOT NULL,
  proposer_player_id TEXT        NOT NULL,
  action             TEXT        NOT NULL,
  args               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  status             TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'confirmed', 'failed', 'cancelled')),
  expires_at         TIMESTAMPTZ NOT NULL,
  schema_version     INTEGER     NOT NULL DEFAULT 1,
  result             JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Confirm/cancel routes look up by id (PK); the message renderer looks up by
-- message_id (already UNIQUE, so indexed). Add the proposer+status lookup
-- used by "does this player have an active card" style checks.
CREATE INDEX IF NOT EXISTS idx_assistant_cards_proposer_status
  ON messaging.assistant_cards (proposer_player_id, status);
