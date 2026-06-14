-- Drop the winner_id -> players(id) foreign key on group_matches.
-- group_matches is polymorphic (singles uses player1/player2, doubles uses team1/team2),
-- so winner_id holds a player id for singles but a team id for doubles. A single FK to
-- players(id) makes doubles score submission fail. Match-type integrity is already
-- enforced by the check_match_type constraint (migration 018); referential integrity for
-- participants is covered by the player1/player2/team1/team2 FKs.

ALTER TABLE public.group_matches
DROP CONSTRAINT IF EXISTS group_matches_winner_id_fkey;
