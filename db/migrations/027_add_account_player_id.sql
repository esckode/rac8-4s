-- Link accounts to their durable player identity (P1).
--
-- An account (auth schema) and a player (public schema) for the same person were
-- previously joined only by a shared email string, with no stored relationship.
-- This adds an explicit player_id on auth.accounts so signup can claim the
-- existing email-keyed player and a registered user acts as one identity across
-- tournaments. Cross-schema FK is allowed in PostgreSQL.

ALTER TABLE auth.accounts
  ADD COLUMN IF NOT EXISTS player_id TEXT REFERENCES public.players(id);

CREATE INDEX IF NOT EXISTS idx_accounts_player_id ON auth.accounts(player_id);
