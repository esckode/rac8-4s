-- ISSUE-18: a player could end up linked as the confirmed partner of two
-- different registrations in the same tournament (last write wins on the
-- second confirm). Concurrent *pending* claims on the same player are correct
-- and intended (ISSUE-16), so the index only constrains confirmed rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_registrations_confirmed_partner
  ON public.player_registrations (tournament_id, partner_id)
  WHERE partner_confirmed = true;
