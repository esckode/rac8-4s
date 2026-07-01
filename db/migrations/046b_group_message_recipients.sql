-- Migration 046b: group_message_recipients table (P2.2)
--
-- Adds unread + digest tracking for non-tournament messages
-- (group chat and personal notification threads).
-- Separated from 046 to allow incremental application.

CREATE TABLE IF NOT EXISTS messaging.group_message_recipients (
  message_id   UUID         NOT NULL REFERENCES messaging.group_messages(id),
  player_id    TEXT         NOT NULL,
  read_at      TIMESTAMPTZ,
  notified_at  TIMESTAMPTZ,
  PRIMARY KEY (message_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_group_message_recipients_player_read
  ON messaging.group_message_recipients (player_id, read_at);
