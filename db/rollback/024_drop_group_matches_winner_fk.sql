-- Rollback 024: restore the winner_id -> players(id) foreign key on group_matches.
-- NOTE: fails if winner_id holds a team id (doubles) — that data references
-- teams, not players, and must be cleared/converted before rolling back.

ALTER TABLE public.group_matches
ADD CONSTRAINT group_matches_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.players(id);
