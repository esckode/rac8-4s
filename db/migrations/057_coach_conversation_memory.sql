-- Migration 057: 1:1 Coach — type='coach' conversation, player_memories, card re-key
--
-- COACH_1TO1_DESIGN.md §7 #1 (surface), §7 #7a (memory opt-in default ON), §5.2 (card
-- scope generalization). See COACH_1TO1_IMPLEMENTATION.md §0.3 for the target-state summary.

-- 1. Widen conversations.type CHECK to include 'coach'
ALTER TABLE messaging.conversations
  DROP CONSTRAINT IF EXISTS conversations_type_check;

ALTER TABLE messaging.conversations
  ADD CONSTRAINT conversations_type_check
  CHECK (type IN ('tournament', 'group', 'personal', 'coach'));

-- 2. The existing idx_conversations_player_id (046) is a plain unique index on
--    player_id WHERE player_id IS NOT NULL — NOT scoped by type. A player with an
--    existing 'personal' conversation would collide with their own 'coach' conversation
--    under that index (same player_id value, two different type rows). Narrow it to
--    'personal' (the only type it has ever guarded) and add a sibling scoped to 'coach'.
DROP INDEX IF EXISTS messaging.idx_conversations_player_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_personal_player_id
  ON messaging.conversations (player_id)
  WHERE type = 'personal';

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_coach_player_id
  ON messaging.conversations (player_id)
  WHERE type = 'coach';

-- 3. assistant_cards: re-key onto conversation_id (design §5.2 deviation 1 — scope is
--    derived from conversations.type, never from group_id IS NULL). Not live in prod,
--    so this is a schema change with a local/dev backfill, not migration-with-backfill
--    ceremony.
ALTER TABLE messaging.assistant_cards
  ADD COLUMN IF NOT EXISTS conversation_id UUID;

UPDATE messaging.assistant_cards ac
SET conversation_id = gm.conversation_id
FROM messaging.group_messages gm
WHERE gm.id = ac.message_id
  AND ac.conversation_id IS NULL;

ALTER TABLE messaging.assistant_cards
  ALTER COLUMN conversation_id SET NOT NULL;

ALTER TABLE messaging.assistant_cards
  DROP CONSTRAINT IF EXISTS assistant_cards_conversation_id_fkey;

ALTER TABLE messaging.assistant_cards
  ADD CONSTRAINT assistant_cards_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES messaging.conversations(id);

-- group_id becomes a denormalized, never-authoritative convenience for the existing
-- group-route auth checks; NULL for coach cards.
ALTER TABLE messaging.assistant_cards
  ALTER COLUMN group_id DROP NOT NULL;

-- 4. player_settings: coach memory opt-in — default ON (§7 #7a, owner call). The
--    per-memory propose_remember confirm card remains the real consent gate.
ALTER TABLE public.player_settings
  ADD COLUMN IF NOT EXISTS coach_memory_enabled BOOLEAN NOT NULL DEFAULT true;

-- 5. player_memories: consented per-player fact store (§5, §5.2). Cap (~20 entries) is
--    service-enforced, not a DB constraint. created_at uses clock_timestamp() rather
--    than now() — now() is frozen at transaction start, so two memories confirmed in
--    quick succession inside the same transaction (as the test harness's per-suite
--    wrapping transaction does) would otherwise tie, making "newest-first" ordering
--    depend on random UUID tiebreak order instead of actual insertion order.
CREATE TABLE IF NOT EXISTS public.player_memories (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id  TEXT        NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  body       TEXT        NOT NULL CHECK (char_length(body) <= 280),
  source     TEXT        NOT NULL CHECK (source IN ('player', 'coach')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_player_memories_player_id
  ON public.player_memories (player_id);
