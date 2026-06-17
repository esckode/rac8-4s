-- Normalize existing player emails to lowercase so that player identity dedups
-- case-insensitively (matching PlayerRepository, which now stores and matches
-- emails in lowercase). Without this, a player entered as John@x.com and
-- john@x.com forks into two player_ids and splits their stats.
--
-- Safe in-place lowercasing: this assumes no case-variant duplicates exist (i.e.
-- no two rows share the same LOWER(email)). If a future dataset has collisions,
-- they must be merged (repointing player_registrations / group_memberships /
-- group_matches / teams / bracket_seeds) before this runs.

UPDATE public.players
SET email = LOWER(email)
WHERE email <> LOWER(email);
