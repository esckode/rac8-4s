-- Migration 049: LLM assistant (@coach) — message type + per-group toggle
--
-- Changes:
--   1. Widen the type CHECK on BOTH message stores to include 'assistant' so the
--      enum never diverges (messaging.messages got its CHECK in 040; group_messages
--      too). Bot rows are type='assistant', player_id=NULL,
--      sender_name_snapshot='Coach' — the explicit type keeps them unambiguous
--      against DSR tombstones (which also have player_id=NULL).
--   2. player_groups.assistant_enabled — per-group toggle, default ON (design Q11).
--
-- Constraint names verified against a live DB (both are the non-auto-generated
-- names): messages_type_check, group_messages_type_check.

-- 1. Widen both type CHECKs (pattern: migration 046 drop/re-add)
ALTER TABLE messaging.messages
  DROP CONSTRAINT IF EXISTS messages_type_check;

ALTER TABLE messaging.messages
  ADD CONSTRAINT messages_type_check
  CHECK (type IN ('text', 'poll', 'system', 'announcement', 'assistant'));

ALTER TABLE messaging.group_messages
  DROP CONSTRAINT IF EXISTS group_messages_type_check;

ALTER TABLE messaging.group_messages
  ADD CONSTRAINT group_messages_type_check
  CHECK (type IN ('text', 'poll', 'system', 'announcement', 'assistant'));

-- 2. Per-group assistant toggle (default ON)
ALTER TABLE public.player_groups
  ADD COLUMN IF NOT EXISTS assistant_enabled BOOLEAN NOT NULL DEFAULT true;
