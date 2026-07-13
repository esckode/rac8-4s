-- Migration 051: LLM assistant (@coach) — weekly digest per-group opt-in
--
-- Phase C (proactive): player_groups.digest_enabled — per-group toggle, default
-- OFF (opt-in, unlike assistant_enabled which defaults ON). The digest sweep
-- gates on assistant_enabled AND digest_enabled (design §11 C-Q1).

ALTER TABLE public.player_groups
  ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN NOT NULL DEFAULT false;
