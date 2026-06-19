-- 030: capture the client locale (navigator.language) on analytics events so we
-- can rank language usage and prioritize localization. Indexed for
-- `SELECT locale, COUNT(*) ... GROUP BY locale` aggregation.
ALTER TABLE public.user_events ADD COLUMN IF NOT EXISTS locale TEXT;
CREATE INDEX IF NOT EXISTS idx_user_events_locale ON public.user_events(locale);
