-- Rollback 028: restore the registration status CHECK constraint without 'unpaired'.
-- NOTE: fails if any player_registrations row currently has status 'unpaired' —
-- repoint those rows to a prior status before rolling back.

ALTER TABLE public.player_registrations
  DROP CONSTRAINT IF EXISTS player_registrations_status_check;

ALTER TABLE public.player_registrations
  ADD CONSTRAINT player_registrations_status_check
  CHECK (status IN ('registered', 'pending_partner_confirm', 'withdrawn', 'withdrawal_pending'));
