-- Migration 046: personal conversation thread (P2.1)
--
-- Adds support for type='personal' conversations — one per player, used
-- for system notifications delivered to that player directly (kick events,
-- promote/demote, auto-transfer notices).
--
-- Changes:
--   1. Widen conversations.type CHECK to include 'personal'
--   2. Add player_id TEXT column (nullable; set only for type='personal')
--   3. Partial unique index: at most one personal conversation per player

-- 1. Widen the type CHECK constraint
ALTER TABLE messaging.conversations
  DROP CONSTRAINT IF EXISTS conversations_type_check;

ALTER TABLE messaging.conversations
  ADD CONSTRAINT conversations_type_check
  CHECK (type IN ('tournament', 'group', 'personal'));

-- 2. Add player_id column
ALTER TABLE messaging.conversations
  ADD COLUMN IF NOT EXISTS player_id TEXT;

-- 3. Partial unique index: one personal conversation per player
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_player_id
  ON messaging.conversations (player_id)
  WHERE player_id IS NOT NULL;

-- 4. group_message_recipients — unread + digest tracking for non-tournament messages
--    (group chat and personal notification threads both write here)
CREATE TABLE IF NOT EXISTS messaging.group_message_recipients (
  message_id   UUID         NOT NULL REFERENCES messaging.group_messages(id),
  player_id    TEXT         NOT NULL,
  read_at      TIMESTAMPTZ,
  notified_at  TIMESTAMPTZ,
  PRIMARY KEY (message_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_group_message_recipients_player_read
  ON messaging.group_message_recipients (player_id, read_at);
