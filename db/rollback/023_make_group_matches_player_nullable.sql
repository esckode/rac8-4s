-- Rollback 023: restore NOT NULL on group_matches.player1_id / player2_id.
-- NOTE: fails if either column contains NULLs (doubles team matches store team
-- ids instead) — those rows must be removed/converted before rolling back.

ALTER TABLE public.group_matches ALTER COLUMN player1_id SET NOT NULL;

ALTER TABLE public.group_matches ALTER COLUMN player2_id SET NOT NULL;
