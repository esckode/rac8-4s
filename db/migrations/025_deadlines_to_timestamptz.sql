-- Convert tournament deadline columns from naive TIMESTAMP to TIMESTAMPTZ.
--
-- The columns were created as TIMESTAMP (WITHOUT TIME ZONE), which stores a naive
-- wall-clock and no instant. node-pg reinterprets naive values in the process's
-- local timezone on read, shifting deadlines by the server's UTC offset and
-- causing DEADLINE_PASSED checks to fire at the wrong time.
--
-- The application always intended UTC (it sends ISO-8601 'Z' values), so the
-- existing naive values are the intended UTC wall-clock. `AT TIME ZONE 'UTC'`
-- reinterprets them as UTC, producing the correct instant. After this, the
-- columns store true instants and round-trip correctly regardless of server zone
-- (consistent with the auth schema, which already uses TIMESTAMP WITH TIME ZONE).

ALTER TABLE public.tournaments
  ALTER COLUMN registration_deadline   TYPE TIMESTAMPTZ USING registration_deadline   AT TIME ZONE 'UTC',
  ALTER COLUMN group_stage_deadline    TYPE TIMESTAMPTZ USING group_stage_deadline    AT TIME ZONE 'UTC',
  ALTER COLUMN knockout_stage_deadline TYPE TIMESTAMPTZ USING knockout_stage_deadline AT TIME ZONE 'UTC';
