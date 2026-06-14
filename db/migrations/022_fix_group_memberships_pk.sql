-- Add unique constraints to prevent duplicates within groups
-- Null values in player_id and team_id are allowed per the check constraint

ALTER TABLE public.group_memberships
ADD CONSTRAINT unique_group_player_team UNIQUE (group_id, player_id, team_id);
