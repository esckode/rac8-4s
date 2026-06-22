-- 033: partition lifecycle functions for messaging schema.
--
-- Creates three PL/pgSQL functions in the messaging schema:
--   messaging.create_month_partition(target_month date)
--     Idempotently create one calendar month's aligned partitions for BOTH
--     messaging.messages and messaging.message_recipients.
--
--   messaging.ensure_future_partitions(months_ahead int DEFAULT 2)
--     Pre-create partitions for the current month + next months_ahead months.
--     Safe to call repeatedly (uses create_month_partition which is idempotent).
--
--   messaging.purge_old_partitions(retention_days int DEFAULT 90,
--                                   drop_padding_days int DEFAULT 45)
--     Boundary-safe purge. For each messages partition whose range ends before
--     now() - (retention_days + drop_padding_days):
--       GATE: does the partition contain any row for a tournament that is
--             (a) still in-progress (public.tournaments.completed_at IS NULL), OR
--             (b) completed within retention_days of now(), OR
--             (c) has legal_hold = true?
--       If SAFE (gate passes) → DROP partition + aligned message_recipients partition.
--       If UNSAFE            → DETACH partition (keep cold), retry next cycle.
--     Returns SETOF (partition text, action text) where action ∈ {DROPPED, DETACHED}.
--
-- Rollback: see the DO block at the end.

-- ── messaging.create_month_partition ────────────────────────────────────────
CREATE OR REPLACE FUNCTION messaging.create_month_partition(
  target_month date
)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  -- Truncate to first of month
  month_start date := date_trunc('month', target_month)::date;
  month_end   date := (date_trunc('month', target_month) + interval '1 month')::date;
  suffix      text := to_char(month_start, 'YYYY_MM');
  msg_part    text := 'messaging.messages_' || suffix;
  rec_part    text := 'messaging.message_recipients_' || suffix;
BEGIN
  -- Create messages partition (IF NOT EXISTS makes it idempotent)
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.%I
       PARTITION OF messaging.messages
       FOR VALUES FROM (%L) TO (%L)',
    'messaging',
    'messages_' || suffix,
    month_start::text,
    month_end::text
  );

  -- Create aligned message_recipients partition
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.%I
       PARTITION OF messaging.message_recipients
       FOR VALUES FROM (%L) TO (%L)',
    'messaging',
    'message_recipients_' || suffix,
    month_start::text,
    month_end::text
  );
END;
$$;

-- ── messaging.ensure_future_partitions ──────────────────────────────────────
CREATE OR REPLACE FUNCTION messaging.ensure_future_partitions(
  months_ahead int DEFAULT 2
)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  i int;
BEGIN
  FOR i IN 0..months_ahead LOOP
    PERFORM messaging.create_month_partition(
      (date_trunc('month', now()) + (i || ' months')::interval)::date
    );
  END LOOP;
END;
$$;

-- ── messaging.purge_old_partitions ───────────────────────────────────────────
--
-- Returns SETOF (partition text, action text).
-- action is one of: 'DROPPED', 'DETACHED'.
--
-- Algorithm for each messages_YYYY_MM partition:
--   1. Determine the partition range end date from pg_class / pg_get_expr.
--   2. Skip if range_end > now() - (retention_days + drop_padding_days)
--      (too recent to consider).
--   3. Run the GATE query against that partition directly:
--      EXISTS (
--        SELECT 1 FROM <messages_partition>
--        JOIN public.tournaments t ON t.id = tournament_id
--        WHERE
--          t.completed_at IS NULL                           -- (a) in-progress
--          OR t.completed_at > now() - retention_days * interval '1 day'  -- (b) within retention
--          OR legal_hold = true                             -- (c) legal hold
--      )
--   4. If gate fires → DETACH partition + aligned recipients partition.
--      If gate clear  → DROP  partition + aligned recipients partition.
--   5. Emit a row per table acted upon.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'messaging' AND t.typname = 'partition_action'
  ) THEN
    CREATE TYPE messaging.partition_action AS (
      partition text,
      action    text
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION messaging.purge_old_partitions(
  retention_days    int DEFAULT 90,
  drop_padding_days int DEFAULT 45
)
RETURNS SETOF messaging.partition_action
LANGUAGE plpgsql AS $$
DECLARE
  cutoff_date     timestamptz := now() - ((retention_days + drop_padding_days) || ' days')::interval;
  rec             record;
  suffix          text;
  rec_part_name   text;
  part_schema     text;
  part_name       text;
  range_end_expr  text;
  range_end_val   timestamptz;
  unsafe          boolean;
  action_taken    text;
  result_row      messaging.partition_action;
BEGIN
  -- Iterate over all attached child partitions of messaging.messages
  FOR rec IN
    SELECT
      n.nspname AS schemaname,
      child.relname AS partname,
      pg_get_expr(c.relpartbound, c.oid, true) AS part_expr
    FROM pg_inherits i
    JOIN pg_class parent ON parent.oid = i.inhparent
    JOIN pg_class child  ON child.oid  = i.inhrelid
    JOIN pg_namespace n  ON n.oid = child.relnamespace
    JOIN pg_class c      ON c.oid = child.oid
    JOIN pg_namespace pn ON pn.oid = parent.relnamespace
    WHERE pn.nspname = 'messaging'
      AND parent.relname = 'messages'
    ORDER BY child.relname
  LOOP
    part_schema   := rec.schemaname;
    part_name     := rec.partname;

    -- Extract the TO value from the partition bound expression.
    -- pg_get_expr returns something like: FOR VALUES FROM ('2024-01-01') TO ('2024-02-01')
    -- We extract the TO date.
    range_end_expr := substring(rec.part_expr FROM 'TO \(''([^'']+)''\)');
    IF range_end_expr IS NULL THEN
      CONTINUE; -- Can't parse; skip
    END IF;
    range_end_val := range_end_expr::timestamptz;

    -- Skip partitions that are not old enough yet
    IF range_end_val > cutoff_date THEN
      CONTINUE;
    END IF;

    -- Determine the aligned recipients partition name
    -- Strip 'messages_' prefix to get suffix, then build recipients name
    suffix        := substring(part_name FROM '^messages_(.+)$');
    rec_part_name := 'message_recipients_' || suffix;

    -- Run the boundary-safety gate
    EXECUTE format(
      'SELECT EXISTS (
         SELECT 1
         FROM %I.%I m
         JOIN public.tournaments t ON t.id = m.tournament_id
         WHERE t.completed_at IS NULL
            OR t.completed_at > now() - ($1 || '' days'')::interval
            OR m.legal_hold = true
       )',
      part_schema,
      part_name
    )
    USING retention_days
    INTO unsafe;

    IF unsafe THEN
      -- DETACH both partitions (keep cold, retry next cycle)
      EXECUTE format(
        'ALTER TABLE messaging.messages DETACH PARTITION %I.%I',
        part_schema, part_name
      );

      result_row.partition := part_schema || '.' || part_name;
      result_row.action    := 'DETACHED';
      RETURN NEXT result_row;

      -- Detach recipients partition if it is still attached
      PERFORM 1
      FROM pg_inherits i
      JOIN pg_class child  ON child.oid  = i.inhrelid
      JOIN pg_class parent ON parent.oid = i.inhparent
      JOIN pg_namespace n  ON n.oid = child.relnamespace
      WHERE n.nspname = part_schema AND child.relname = rec_part_name;

      IF FOUND THEN
        EXECUTE format(
          'ALTER TABLE messaging.message_recipients DETACH PARTITION %I.%I',
          part_schema, rec_part_name
        );
        result_row.partition := part_schema || '.' || rec_part_name;
        result_row.action    := 'DETACHED';
        RETURN NEXT result_row;
      END IF;

    ELSE
      -- SAFE — DROP both partitions.
      -- The parent message_recipients table holds auto-generated FK constraints
      -- that reference each messages partition; CASCADE removes them together
      -- with the partitions themselves.
      -- Drop recipients first so we don't hit a PK→FK circular dependency,
      -- then drop messages with CASCADE to clean up any remaining references.
      EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', part_schema, rec_part_name);

      result_row.partition := part_schema || '.' || rec_part_name;
      result_row.action    := 'DROPPED';
      RETURN NEXT result_row;

      EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', part_schema, part_name);

      result_row.partition := part_schema || '.' || part_name;
      result_row.action    := 'DROPPED';
      RETURN NEXT result_row;
    END IF;
  END LOOP;
END;
$$;

-- ── Rollback instructions ────────────────────────────────────────────────────
-- To roll back migration 033 run:
--   DROP FUNCTION IF EXISTS messaging.purge_old_partitions(int, int);
--   DROP FUNCTION IF EXISTS messaging.ensure_future_partitions(int);
--   DROP FUNCTION IF EXISTS messaging.create_month_partition(date);
--   DROP TYPE    IF EXISTS messaging.partition_action;
