-- ISSUE-16: a partner claim is now uniform across all invite paths —
-- partner_id set (the invitee already has a player row) XOR
-- pending_partner_email set (they don't) — with status staying
-- 'registered' for both until someone confirms. pending_partner_confirm no
-- longer means anything once a claim stops changing status, so it is
-- removed from the CHECK constraint.
ALTER TABLE public.player_registrations
  ADD COLUMN pending_partner_email TEXT,
  ADD COLUMN partner_claimed_at    TIMESTAMPTZ;

ALTER TABLE public.player_registrations
  DROP CONSTRAINT IF EXISTS player_registrations_status_check;

ALTER TABLE public.player_registrations
  ADD CONSTRAINT player_registrations_status_check
  CHECK (status IN ('registered', 'withdrawn', 'withdrawal_pending', 'unpaired'));
