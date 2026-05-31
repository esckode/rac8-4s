-- Fix password reset code timestamps to use TIMESTAMP WITH TIME ZONE
-- This ensures consistent UTC timezone handling across databases
ALTER TABLE auth.password_reset_codes
  ALTER COLUMN expires_at TYPE TIMESTAMP WITH TIME ZONE,
  ALTER COLUMN used_at TYPE TIMESTAMP WITH TIME ZONE,
  ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE;
