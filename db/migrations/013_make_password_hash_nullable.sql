-- Make password_hash nullable to support accounts created without passwords
ALTER TABLE auth.accounts ALTER COLUMN password_hash DROP NOT NULL;
