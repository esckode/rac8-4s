-- Migration 038: add age-gate attestation columns to public.players
--
-- G0.1 — 18+ age gate at the universal player boundary (§12.2).
-- Data-minimisation: we store ONLY the derived result of the attestation check,
-- never the raw date of birth.
--
--   is_adult        — TRUE when the player passed the gate at creation time;
--                     NULL for pre-existing players awaiting their one-time
--                     attestation prompt (backfill: non-destructive).
--   age_attested_at — TIMESTAMPTZ when the attestation was recorded.
--   policy_version  — which version of the ToS/privacy policy was accepted.
--
-- Pre-existing players: all three columns are left NULL. They will receive a
-- one-time attestation prompt at next login; group features remain gated until
-- they attest.

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS is_adult        BOOLEAN,
  ADD COLUMN IF NOT EXISTS age_attested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS policy_version  TEXT;
