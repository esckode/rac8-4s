-- Migration 036: add notified_at to messaging.message_recipients
--
-- Supports V3.1 (messaging.notify worker job / offline notification fallback).
-- The notify processor sets notified_at after sending a digest email, giving
-- an at-least-once idempotency guard: a recipient already notified is not
-- emailed again even if the job is retried.
--
-- The parent-table ALTER propagates to all existing partitions automatically.

ALTER TABLE messaging.message_recipients
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

-- Index: quickly find rows still needing notification
-- (read_at IS NULL AND notified_at IS NULL) per player within a conversation
CREATE INDEX IF NOT EXISTS idx_message_recipients_notify
  ON messaging.message_recipients (player_id, notified_at)
  WHERE notified_at IS NULL;
