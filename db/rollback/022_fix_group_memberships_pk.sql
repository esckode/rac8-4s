-- Rollback 022: drop the (group_id, player_id, team_id) uniqueness constraint.

ALTER TABLE public.group_memberships
DROP CONSTRAINT unique_group_player_team;
