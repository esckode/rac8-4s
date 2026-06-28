-- Migration 044: casual tournament mode + visibility + group association + abandoned status
--
-- G4.1 — Schema additions for the Player Groups / Casual Mode feature:
--
--   1. mode TEXT NOT NULL DEFAULT 'scheduled'
--      Distinguishes casual (group-organized, deadline-optional) from scheduled tournaments.
--
--   2. visibility TEXT NOT NULL DEFAULT 'public'
--      'public'   — appears in the public browse list (GET /tournaments/public)
--      'unlisted' — hidden from browse; reachable only by direct URL / invite link (HL:1140)
--
--   3. group_id UUID REFERENCES public.player_groups(id) ON DELETE SET NULL
--      Links a tournament to the group that created it. Nullable — standalone tournaments
--      (not group-organized) leave this NULL.
--
--   4. status CHECK constraint widened to include 'abandoned'.
--      The column has no existing CHECK; we add one covering all current values plus
--      'abandoned' so organizers can mark a tournament as abandoned without deleting it.
--
--   5. registration_deadline, group_stage_deadline, knockout_stage_deadline — DROP NOT NULL.
--      Casual tournaments may omit deadlines. Existing rows keep their current values.

-- 1. Add mode column
ALTER TABLE public.tournaments
  ADD COLUMN mode TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (mode IN ('scheduled', 'casual'));

-- 2. Add visibility column
ALTER TABLE public.tournaments
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'unlisted'));

-- 3. Add group_id column (nullable FK)
ALTER TABLE public.tournaments
  ADD COLUMN group_id UUID REFERENCES public.player_groups(id) ON DELETE SET NULL;

-- 4. Add status CHECK constraint (no existing constraint; covers all known + new values)
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_status_check
    CHECK (status IN (
      'draft',
      'registration_open',
      'registration_closed',
      'group_stage_active',
      'group_stage_complete',
      'knockout_active',
      'tournament_complete',
      'knockout_complete',
      'completed',
      'abandoned'
    ));

-- 5. Make deadline columns nullable (casual tournaments may omit deadlines)
ALTER TABLE public.tournaments
  ALTER COLUMN registration_deadline   DROP NOT NULL,
  ALTER COLUMN group_stage_deadline    DROP NOT NULL,
  ALTER COLUMN knockout_stage_deadline DROP NOT NULL;
