-- Rollback Phase 1.1: Drop Teams Table

DROP INDEX IF EXISTS public.idx_teams_player2;
DROP INDEX IF EXISTS public.idx_teams_player1;
DROP INDEX IF EXISTS public.idx_teams_tournament;
DROP TABLE IF EXISTS public.teams;
