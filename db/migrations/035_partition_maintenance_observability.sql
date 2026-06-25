-- 035: partition maintenance observability (V2.1)
--
-- Adds:
--   1. messaging.partition_maintenance_runs — audit table recording each
--      maintenance run with timing, action counts, dry-run flag, and error.
--   2. messaging.reclaim_detached_partitions(retention_days, drop_padding_days)
--      Re-applies the boundary-safe gate against detached partitions.
--      When a partition was previously DETACHED (kept cold) and the gate now
--      passes (tournament past retention, no legal_hold), this function DROPs it.
--      Returns SETOF (partition text, action text) where action = 'DROPPED'.
--
-- All timestamps: TIMESTAMPTZ only (UTC everywhere; avoids the deadline bug).

-- ── messaging.partition_maintenance_runs ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS messaging.partition_maintenance_runs (
  id              SERIAL       PRIMARY KEY,
  run_type        TEXT         NOT NULL CHECK (run_type IN ('ensure', 'purge', 'reclaim')),
  ran_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  duration_ms     INTEGER,
  created_count   INTEGER      NOT NULL DEFAULT 0,
  dropped_count   INTEGER      NOT NULL DEFAULT 0,
  detached_count  INTEGER      NOT NULL DEFAULT 0,
  reclaimed_count INTEGER      NOT NULL DEFAULT 0,
  dry_run         BOOLEAN      NOT NULL DEFAULT false,
  success         BOOLEAN      NOT NULL DEFAULT true,
  error_message   TEXT
);

-- ── messaging.reclaim_detached_partitions ────────────────────────────────────
--
-- Scans pg_class for tables in the messaging schema whose name matches the
-- messages_YYYY_MM pattern and are NOT in pg_inherits (i.e., detached).
-- For each detached messages partition:
--   Re-runs the boundary-safety gate (same logic as purge_old_partitions).
--   If SAFE → DROP the messages partition + aligned recipients partition.
--   Returns rows for each dropped partition.

CREATE OR REPLACE FUNCTION messaging.reclaim_detached_partitions(
  retention_days    int DEFAULT 90,
  drop_padding_days int DEFAULT 45
)
RETURNS SETOF messaging.partition_action
LANGUAGE plpgsql AS $$
DECLARE
  rec             record;
  suffix          text;
  rec_part_name   text;
  range_end_val   timestamptz;
  unsafe          boolean;
  result_row      messaging.partition_action;
BEGIN
  -- Find detached messaging.messages_YYYY_MM tables:
  -- They are in pg_class (exist) but NOT in pg_inherits (not attached to parent).
  FOR rec IN
    SELECT
      n.nspname AS schemaname,
      c.relname AS partname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'messaging'
      AND c.relname ~ '^messages_[0-9]{4}_[0-9]{2}$'
      AND c.relkind = 'r'
      -- Not in pg_inherits (detached = not a child of any parent)
      AND NOT EXISTS (
        SELECT 1
        FROM pg_inherits i
        WHERE i.inhrelid = c.oid
      )
    ORDER BY c.relname
  LOOP
    -- Extract range end from the partition name (e.g. messages_2024_05 → 2024-06-01)
    -- Parse YYYY_MM suffix to compute month_end
    DECLARE
      parts text[];
      year  int;
      month int;
    BEGIN
      parts := regexp_match(rec.partname, '^messages_([0-9]{4})_([0-9]{2})$');
      IF parts IS NULL THEN
        CONTINUE;
      END IF;
      year  := parts[1]::int;
      month := parts[2]::int;
      -- month_end = first day of NEXT month
      range_end_val := make_timestamptz(year, month, 1, 0, 0, 0, 'UTC')
                       + interval '1 month';
    END;

    -- Skip if not old enough yet (same threshold as purge_old_partitions)
    IF range_end_val > now() - ((retention_days + drop_padding_days) || ' days')::interval THEN
      CONTINUE;
    END IF;

    -- Determine aligned recipients partition
    suffix        := substring(rec.partname FROM '^messages_(.+)$');
    rec_part_name := 'message_recipients_' || suffix;

    -- Re-run boundary-safety gate against the detached table
    -- (The table exists but is not attached to the parent; query it directly.)
    EXECUTE format(
      'SELECT EXISTS (
         SELECT 1
         FROM %I.%I m
         JOIN public.tournaments t ON t.id = m.tournament_id
         WHERE t.completed_at IS NULL
            OR t.completed_at > now() - ($1 || '' days'')::interval
            OR m.legal_hold = true
       )',
      rec.schemaname,
      rec.partname
    )
    USING retention_days
    INTO unsafe;

    IF unsafe THEN
      -- Still not safe — skip (leave detached, try again next cycle)
      CONTINUE;
    END IF;

    -- Safe to reclaim — DROP both detached tables
    -- Drop recipients first to avoid FK issues
    EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', rec.schemaname, rec_part_name);
    result_row.partition := rec.schemaname || '.' || rec_part_name;
    result_row.action    := 'DROPPED';
    RETURN NEXT result_row;

    EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', rec.schemaname, rec.partname);
    result_row.partition := rec.schemaname || '.' || rec.partname;
    result_row.action    := 'DROPPED';
    RETURN NEXT result_row;
  END LOOP;
END;
$$;

-- ── Rollback instructions ─────────────────────────────────────────────────────
-- To roll back migration 035:
--   DROP FUNCTION IF EXISTS messaging.reclaim_detached_partitions(int, int);
--   DROP TABLE IF EXISTS messaging.partition_maintenance_runs;
