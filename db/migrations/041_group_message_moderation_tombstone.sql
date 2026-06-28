-- Migration 041: moderation tombstone columns for messaging.group_messages
--
-- G2.3 — Moderation: owner delete-message (tombstone)
--
-- Adds two columns to messaging.group_messages to support soft-delete by group owners:
--
--   removed_at TIMESTAMPTZ — set to now() when an owner tombstones a message.
--                            NULL on all normal (non-moderated) rows.
--   removed_by TEXT        — the player_id (TEXT) of the owner who removed the message.
--                            NULL on non-moderated rows.
--
-- Distinguishing moderation vs. DSR anonymization:
--   DSR (anonymizeGroupMessagesFor) sets player_id=NULL, sender_name_snapshot='Former player',
--   body='' — it does NOT set removed_at/removed_by.
--   Moderation (owner delete) sets removed_at + removed_by in addition to clearing the
--   body and attribution. A row with removed_at NOT NULL was moderation-removed; a row
--   with sender_name_snapshot='Former player' and removed_at NULL was DSR-erased.
--
-- All timestamps: TIMESTAMPTZ only (UTC-everywhere per CLAUDE.md §7).

ALTER TABLE messaging.group_messages
  ADD COLUMN IF NOT EXISTS removed_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS removed_by  TEXT        DEFAULT NULL;
