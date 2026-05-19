-- Add partner_id column if it doesn't exist
ALTER TABLE public.player_registrations ADD COLUMN IF NOT EXISTS partner_id TEXT REFERENCES public.players(id);

-- Add partner_confirmed column if it doesn't exist
ALTER TABLE public.player_registrations ADD COLUMN IF NOT EXISTS partner_confirmed BOOLEAN DEFAULT false;

-- Add status column if it doesn't exist
ALTER TABLE public.player_registrations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'registered' CHECK(status IN ('registered', 'pending_partner_confirm', 'withdrawn', 'withdrawal_pending'));

-- Add withdrawal_requested_at column if it doesn't exist
ALTER TABLE public.player_registrations ADD COLUMN IF NOT EXISTS withdrawal_requested_at TIMESTAMP;

-- Add confirmed_at column if it doesn't exist
ALTER TABLE public.player_registrations ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_registrations_status ON public.player_registrations(tournament_id, status);
