-- Migration 040: group conversation support + durable group_messages
--
-- G2.1 — Group conversation + durable group_messages (anonymization-ready)
--
-- Depends on:
--   034 (messaging.conversations with type CHECK already allowing 'group', group_id TEXT)
--   039 (public.player_groups with UUID pk)
--
-- What this migration does:
--
--   1. messages.type column
--      Adds a type CHECK-constrained column to messaging.messages (the partitioned
--      parent). Existing rows default to 'text'. The V1.0 scope guard in migration
--      034 deferred this to Player-Groups scope — delivered here.
--
--   2. conversations.group_id index
--      Adds a unique partial index so each player_group has at most one conversation
--      row (mirrors the tournament_id unique index from migration 034).
--
--   3. messaging.group_messages — durable, non-partitioned
--      A plain (non-partitioned) table in the messaging schema. Low-volume + durable
--      (never auto-purged); this is "Option X" from §3 of the design doc.
--      §0.5 compliance: player_id is NULLABLE (required for erasure tombstone);
--      sender_name_snapshot stores the display name at send time so it can be
--      tombstoned to "Former player" on a DSR request independently of the player row.
--
--   Retention: group conversations are exempt from messaging.purge_old_partitions —
--   the purge function only looks at messaging.messages (partitioned) and joins on
--   public.tournaments. group_messages is a separate plain table and is never touched
--   by the partition purge logic, making group data inherently durable.
--
--   group_id reconciliation: conversations.group_id is TEXT (migration 034); player_groups.id
--   is UUID (migration 039). We store the UUID as TEXT — Postgres casts UUID→TEXT
--   transparently on insert ($1::text or implicit). This mirrors how tournament_id is
--   TEXT even though it references public.tournaments.id. No FK is declared because the
--   conversations schema is in messaging and cross-schema FKs can complicate partition
--   maintenance; the application layer enforces the referential constraint.
--
-- All timestamps: TIMESTAMPTZ only (UTC-everywhere per CLAUDE.md §7).

-- ── 1. Add messages.type to the partitioned parent ───────────────────────────
--
-- Postgres propagates a column ADD to all existing partitions automatically.
-- DEFAULT 'text' sets existing rows without rewriting; CHECK is also propagated.
ALTER TABLE messaging.messages
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'text'
    CHECK (type IN ('text', 'poll', 'system', 'announcement'));

-- ── 2. Unique index: one group → one conversation ────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_group_id
  ON messaging.conversations (group_id)
  WHERE group_id IS NOT NULL;

-- ── 3. messaging.group_messages — durable plain table ───────────────────────
CREATE TABLE IF NOT EXISTS messaging.group_messages (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id      UUID        NOT NULL
                                   REFERENCES messaging.conversations(id),
  -- §0.5: player_id is NULLABLE — set to NULL on DSR erasure (anonymize-in-place)
  player_id            TEXT,
  -- §0.5: sender_name_snapshot — tombstone-able display name stored at send time.
  -- On DSR erasure, set to 'Former player'. Separate from player_id so a name
  -- change or player deletion doesn't retroactively alter chat history.
  sender_name_snapshot TEXT        NOT NULL,
  body                 TEXT        NOT NULL DEFAULT '',
  type                 TEXT        NOT NULL DEFAULT 'text'
                                   CHECK (type IN ('text', 'poll', 'system', 'announcement')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for conversation history queries (conversation_id, created_at)
CREATE INDEX IF NOT EXISTS idx_group_messages_conversation_created
  ON messaging.group_messages (conversation_id, created_at);
