-- Create auth schema and tables for account management
CREATE SCHEMA IF NOT EXISTS auth;

-- Accounts table for storing user credentials and roles
CREATE TABLE IF NOT EXISTS auth.accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'organizer', 'player')),
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'deleted')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Password reset codes table for managing password reset flow
CREATE TABLE IF NOT EXISTS auth.password_reset_codes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  attempts INTEGER DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (account_id) REFERENCES auth.accounts(id) ON DELETE CASCADE
);
