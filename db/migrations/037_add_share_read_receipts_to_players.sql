-- Migration 037: add share_read_receipts to public.players
--
-- Supports V6.1 (read-receipt visibility / opt-in DM "seen").
-- A recipient who opts in (share_read_receipts = true) allows the DM sender
-- to see their read_at timestamp for messages sent to them.
-- Default is FALSE — privacy-off by default per §17.6 and §8.

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS share_read_receipts BOOLEAN NOT NULL DEFAULT FALSE;
