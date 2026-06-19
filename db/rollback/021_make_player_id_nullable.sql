-- Rollback 021: restore the (group_id, player_id) primary key on group_memberships
-- and drop the surrogate id column.
-- NOTE: fails if player_id contains NULLs (team-based rows) or duplicate
-- (group_id, player_id) pairs exist — clean those up before rolling back.

ALTER TABLE public.group_memberships DROP COLUMN id;

ALTER TABLE public.group_memberships ALTER COLUMN player_id SET NOT NULL;

ALTER TABLE public.group_memberships
ADD CONSTRAINT group_memberships_pkey PRIMARY KEY (group_id, player_id);
