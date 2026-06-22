-- Rollback 031: revert the normalized columns back to naive TIMESTAMP.
-- `USING col AT TIME ZONE 'UTC'` on a TIMESTAMPTZ yields the wall-clock value at UTC,
-- the inverse of the forward conversion.

ALTER TABLE public.tournaments
  ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMP USING updated_at AT TIME ZONE 'UTC',
  ALTER COLUMN deleted_at TYPE TIMESTAMP USING deleted_at AT TIME ZONE 'UTC';

ALTER TABLE public.players
  ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMP USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE public.player_registrations
  ALTER COLUMN registered_at          TYPE TIMESTAMP USING registered_at          AT TIME ZONE 'UTC',
  ALTER COLUMN withdrawal_requested_at TYPE TIMESTAMP USING withdrawal_requested_at AT TIME ZONE 'UTC',
  ALTER COLUMN confirmed_at           TYPE TIMESTAMP USING confirmed_at           AT TIME ZONE 'UTC';

ALTER TABLE public.groups
  ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC';

ALTER TABLE public.group_matches
  ALTER COLUMN created_at          TYPE TIMESTAMP USING created_at          AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at          TYPE TIMESTAMP USING updated_at          AT TIME ZONE 'UTC',
  ALTER COLUMN player1_confirmed_at TYPE TIMESTAMP USING player1_confirmed_at AT TIME ZONE 'UTC',
  ALTER COLUMN player2_confirmed_at TYPE TIMESTAMP USING player2_confirmed_at AT TIME ZONE 'UTC';

ALTER TABLE public.knockout_matches
  ALTER COLUMN created_at          TYPE TIMESTAMP USING created_at          AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at          TYPE TIMESTAMP USING updated_at          AT TIME ZONE 'UTC',
  ALTER COLUMN player1_confirmed_at TYPE TIMESTAMP USING player1_confirmed_at AT TIME ZONE 'UTC',
  ALTER COLUMN player2_confirmed_at TYPE TIMESTAMP USING player2_confirmed_at AT TIME ZONE 'UTC';

ALTER TABLE public.locations
  ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMP USING updated_at AT TIME ZONE 'UTC',
  ALTER COLUMN deleted_at TYPE TIMESTAMP USING deleted_at AT TIME ZONE 'UTC';

ALTER TABLE public.courts
  ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMP USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE public.teams
  ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC';

ALTER TABLE public.user_events
  ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC';

ALTER TABLE public.schema_migrations
  ALTER COLUMN executed_at TYPE TIMESTAMP USING executed_at AT TIME ZONE 'UTC';
