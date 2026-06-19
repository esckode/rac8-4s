-- Rollback 029: restore the player(id) foreign keys on bracket_seeds.player_id
-- and knockout_matches.winner_id.
-- NOTE: this fails if any doubles team ids are present in these columns (they
-- reference teams, not players) — drop/convert that data before rolling back.

ALTER TABLE public.bracket_seeds
ADD CONSTRAINT bracket_seeds_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id);

ALTER TABLE public.knockout_matches
ADD CONSTRAINT knockout_matches_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.players(id);
