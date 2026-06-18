-- Allow team ids in the knockout/bracket participant columns for doubles.
--
-- bracket_seeds.player_id and knockout_matches.winner_id are polymorphic: they
-- hold a player id for singles but a TEAM id for doubles. A FK to players(id)
-- therefore breaks doubles bracket generation (seeding) and doubles knockout
-- score submission (recording the winning team). This mirrors migration 024,
-- which dropped the same kind of FK on group_matches.winner_id.
--
-- Referential integrity for doubles participants is still covered by the
-- knockout_matches team1_id/team2_id -> teams(id) FKs and the
-- check_knockout_match_type constraint; singles is covered by the
-- player1_id/player2_id -> players(id) FKs.

ALTER TABLE public.bracket_seeds
DROP CONSTRAINT IF EXISTS bracket_seeds_player_id_fkey;

ALTER TABLE public.knockout_matches
DROP CONSTRAINT IF EXISTS knockout_matches_winner_id_fkey;
