-- 034: conversations abstraction (V1.0)
--
-- Adds messaging.conversations as a generalized container that the bus/SSE/history
-- key on, so Player Groups (and future thread models) can layer on without
-- re-plumbing. For tournaments, behavior is unchanged:
--   - Every existing tournament gets exactly one conversation row (type = 'tournament').
--   - Every existing message is linked to its tournament's conversation.
--   - messages.conversation_id is then made NOT NULL.
--
-- Scope guard: only type='tournament' here. group_id, type='group', and
-- messages.type are Player-Groups scope — not included.
--
-- All timestamps: TIMESTAMPTZ only (UTC everywhere; avoids the deadline bug
-- fixed by migration 025).

-- ── messaging.conversations ────────────────────────────────────────────────
CREATE TABLE messaging.conversations (
  id            UUID   NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type          TEXT   NOT NULL CHECK (type IN ('tournament', 'group')),
  tournament_id TEXT,
  group_id      TEXT
);

-- One tournament → one conversation (enforced on insert via UNIQUE)
CREATE UNIQUE INDEX idx_conversations_tournament_id
  ON messaging.conversations (tournament_id)
  WHERE tournament_id IS NOT NULL;

-- Fast lookup: conversation by tournament_id
CREATE INDEX idx_conversations_tournament
  ON messaging.conversations (tournament_id);

-- ── Backfill: create one conversation per tournament ───────────────────────
-- This covers every tournament that already has messages. Tournaments with no
-- messages are also seeded so they get a conversation on first message send.
INSERT INTO messaging.conversations (type, tournament_id)
SELECT DISTINCT 'tournament', m.tournament_id
FROM messaging.messages m
ON CONFLICT DO NOTHING;

-- ── messages.conversation_id column ───────────────────────────────────────
ALTER TABLE messaging.messages ADD COLUMN conversation_id UUID;

-- Link existing messages to their tournament's conversation
UPDATE messaging.messages m
SET conversation_id = c.id
FROM messaging.conversations c
WHERE c.tournament_id = m.tournament_id;

-- Make NOT NULL — all existing rows are now linked
ALTER TABLE messaging.messages ALTER COLUMN conversation_id SET NOT NULL;

-- Index: conversation history queries (conversation_id, created_at)
CREATE INDEX idx_messages_conversation_created
  ON messaging.messages (conversation_id, created_at);
