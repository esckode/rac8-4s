-- 031: normalize all remaining naive TIMESTAMP columns to TIMESTAMPTZ.
-- Finishes the "UTC everywhere = TIMESTAMPTZ" job that migration 025 started for the
-- tournament deadline columns (and 014/015 did for the auth schema). Naive TIMESTAMP stores a
-- wall-clock value with no zone, so instant comparisons shift by the server's UTC offset
-- (the deadline bug, migration 025). Each column is reinterpreted as UTC via
-- `USING col AT TIME ZONE 'UTC'`, which is deterministic regardless of session timezone.
-- Already-TIMESTAMPTZ columns (auth.*, tournament deadlines) are intentionally untouched.

ALTER TABLE public.tournaments
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC',
  ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC';

ALTER TABLE public.players
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE public.player_registrations
  ALTER COLUMN registered_at          TYPE TIMESTAMPTZ USING registered_at          AT TIME ZONE 'UTC',
  ALTER COLUMN withdrawal_requested_at TYPE TIMESTAMPTZ USING withdrawal_requested_at AT TIME ZONE 'UTC',
  ALTER COLUMN confirmed_at           TYPE TIMESTAMPTZ USING confirmed_at           AT TIME ZONE 'UTC';

ALTER TABLE public.groups
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE public.group_matches
  ALTER COLUMN created_at          TYPE TIMESTAMPTZ USING created_at          AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at          TYPE TIMESTAMPTZ USING updated_at          AT TIME ZONE 'UTC',
  ALTER COLUMN player1_confirmed_at TYPE TIMESTAMPTZ USING player1_confirmed_at AT TIME ZONE 'UTC',
  ALTER COLUMN player2_confirmed_at TYPE TIMESTAMPTZ USING player2_confirmed_at AT TIME ZONE 'UTC';

ALTER TABLE public.knockout_matches
  ALTER COLUMN created_at          TYPE TIMESTAMPTZ USING created_at          AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at          TYPE TIMESTAMPTZ USING updated_at          AT TIME ZONE 'UTC',
  ALTER COLUMN player1_confirmed_at TYPE TIMESTAMPTZ USING player1_confirmed_at AT TIME ZONE 'UTC',
  ALTER COLUMN player2_confirmed_at TYPE TIMESTAMPTZ USING player2_confirmed_at AT TIME ZONE 'UTC';

ALTER TABLE public.locations
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC',
  ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC';

ALTER TABLE public.courts
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE public.teams
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE public.user_events
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

-- Internal bookkeeping table (created by the migration runner) — converted for consistency.
ALTER TABLE public.schema_migrations
  ALTER COLUMN executed_at TYPE TIMESTAMPTZ USING executed_at AT TIME ZONE 'UTC';
