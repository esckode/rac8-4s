-- Migration 062: per-member server-side read state for group chat (ISSUE-56)
--
-- NOT NULL DEFAULT now() mirrors the existing joined_at column
-- (039_create_player_groups.sql:36) and settles two things at once:
-- existing dev rows are stamped on migrate, and every future join defaults
-- to "caught up" — so no NULL branch is needed anywhere, and no
-- application-level seeding at join.

ALTER TABLE public.player_group_members
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ NOT NULL DEFAULT now();
