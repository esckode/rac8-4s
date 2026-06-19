-- Rollback 030: drop the locale column and its index from user_events.
DROP INDEX IF EXISTS public.idx_user_events_locale;
ALTER TABLE public.user_events DROP COLUMN IF EXISTS locale;
