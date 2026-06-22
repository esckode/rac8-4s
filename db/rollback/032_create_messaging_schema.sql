-- Rollback 032: drop the messaging schema (cascades to all tables/partitions)
-- and remove the completed_at column from public.tournaments.
DROP SCHEMA IF EXISTS messaging CASCADE;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS completed_at;
