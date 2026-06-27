-- Migration 039: community player_groups + player_group_members tables
--
-- G1.1 — Schema: group entity & membership (multi-owner).
--
-- NOTE: public.groups and public.group_matches already exist as the tournament
-- group-stage tables (migration 003). These new tables are named with the
-- player_ prefix to avoid collision:
--   public.player_groups        — the durable community group entity
--   public.player_group_members — many-to-many membership (multiple owners allowed)
--
-- Design decisions (§11.3):
--   - created_by is audit-only (immutable); group_members.role is the sole authority
--     for who is an owner at any point in time.
--   - Multiple role='owner' rows per group are ALLOWED (no unique-owner constraint).
--   - PK on (group_id, player_id) prevents duplicate membership rows.
--   - default_match_format CHECK constrained to {singles, doubles}; default singles.
--   - notify_level CHECK constrained to {all, mentions_polls, muted}; default mentions_polls.
--   - All timestamp columns are TIMESTAMPTZ (UTC-everywhere per CLAUDE.md §7).

CREATE TABLE public.player_groups (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  created_by          TEXT        NOT NULL
                                  REFERENCES public.players(id),
  default_match_format TEXT       NOT NULL DEFAULT 'singles'
                                  CHECK (default_match_format IN ('singles', 'doubles')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.player_group_members (
  group_id     UUID        NOT NULL REFERENCES public.player_groups(id),
  player_id    TEXT        NOT NULL REFERENCES public.players(id),
  role         TEXT        NOT NULL CHECK (role IN ('owner', 'member')),
  notify_level TEXT        NOT NULL DEFAULT 'mentions_polls'
                                    CHECK (notify_level IN ('all', 'mentions_polls', 'muted')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, player_id)
);
