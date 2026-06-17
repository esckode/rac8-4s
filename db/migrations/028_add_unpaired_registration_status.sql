-- Add an 'unpaired' registration status for doubles solo registrants who were
-- dropped at group creation (organizer chose not to auto-pair leftovers).
-- Recreate the status CHECK constraint to include the new value.

ALTER TABLE public.player_registrations
  DROP CONSTRAINT IF EXISTS player_registrations_status_check;

ALTER TABLE public.player_registrations
  ADD CONSTRAINT player_registrations_status_check
  CHECK (status IN ('registered', 'pending_partner_confirm', 'withdrawn', 'withdrawal_pending', 'unpaired'));
