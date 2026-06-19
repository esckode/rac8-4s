-- Rollback 027: remove the account -> player link.

DROP INDEX IF EXISTS auth.idx_accounts_player_id;

ALTER TABLE auth.accounts DROP COLUMN IF EXISTS player_id;
