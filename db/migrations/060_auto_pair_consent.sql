-- ISSUE-17: prospective consent for auto-pairing, captured at registration
-- rather than at group-creation time (when it's too late to go find a
-- partner). Default true preserves today's behaviour for every existing
-- row and every client that omits the field.
ALTER TABLE public.player_registrations
  ADD COLUMN auto_pair_consent BOOLEAN DEFAULT true;
