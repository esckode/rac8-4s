-- P3.5: Add structured metadata JSONB column to messaging.group_messages
-- Enables deep-link payloads on system messages (e.g. { "tournament_id": "..." } on launch events)
ALTER TABLE messaging.group_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
