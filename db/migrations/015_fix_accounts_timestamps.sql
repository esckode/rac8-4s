-- Fix accounts table timestamps to use TIMESTAMP WITH TIME ZONE
-- This ensures consistent UTC timezone handling across databases
ALTER TABLE auth.accounts
  ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE,
  ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE,
  ALTER COLUMN deleted_at TYPE TIMESTAMP WITH TIME ZONE;
