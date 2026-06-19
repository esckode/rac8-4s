-- Rollback 025: convert the tournament deadline columns back to naive TIMESTAMP.
-- `<timestamptz> AT TIME ZONE 'UTC'` yields the UTC wall-clock as a naive value,
-- the inverse of 025's forward conversion.
-- NOTE: drops the time-zone instant; reintroduces the original naive-timestamp
-- behaviour (read in the server's local zone). Only roll back if you understand
-- that DEADLINE checks will shift by the server's UTC offset again.

ALTER TABLE public.tournaments
  ALTER COLUMN registration_deadline   TYPE TIMESTAMP USING registration_deadline   AT TIME ZONE 'UTC',
  ALTER COLUMN group_stage_deadline    TYPE TIMESTAMP USING group_stage_deadline    AT TIME ZONE 'UTC',
  ALTER COLUMN knockout_stage_deadline TYPE TIMESTAMP USING knockout_stage_deadline AT TIME ZONE 'UTC';
