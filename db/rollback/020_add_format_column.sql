DROP INDEX IF EXISTS idx_group_matches_singles_player1;
DROP INDEX IF EXISTS idx_group_matches_singles_player2;
DROP INDEX IF EXISTS idx_group_matches_doubles_team1;
DROP INDEX IF EXISTS idx_group_matches_doubles_team2;
DROP INDEX IF EXISTS idx_knockout_matches_singles_player1;
DROP INDEX IF EXISTS idx_knockout_matches_singles_player2;
DROP INDEX IF EXISTS idx_knockout_matches_doubles_team1;
DROP INDEX IF EXISTS idx_knockout_matches_doubles_team2;

ALTER TABLE public.group_matches DROP CONSTRAINT check_group_matches_format;
ALTER TABLE public.group_matches DROP COLUMN format;

ALTER TABLE public.knockout_matches DROP CONSTRAINT check_knockout_matches_format;
ALTER TABLE public.knockout_matches DROP COLUMN format;
