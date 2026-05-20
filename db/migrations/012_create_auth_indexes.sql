-- Create indexes for auth schema tables for performance

-- Index on email for fast lookups during login
CREATE INDEX IF NOT EXISTS idx_accounts_email ON auth.accounts(email);

-- Index on status for querying active/inactive accounts
CREATE INDEX IF NOT EXISTS idx_accounts_status ON auth.accounts(status);

-- Index for finding active (non-deleted) accounts
CREATE INDEX IF NOT EXISTS idx_accounts_active ON auth.accounts(deleted_at) WHERE deleted_at IS NULL;

-- Index on account_id for finding password reset codes by account
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_account_id ON auth.password_reset_codes(account_id);

-- Index on code for fast lookup during reset code validation
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_code ON auth.password_reset_codes(code);

-- Index on expires_at for finding expired codes during cleanup
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires_at ON auth.password_reset_codes(expires_at);

-- Composite index for finding valid (unused) reset codes
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_valid ON auth.password_reset_codes(account_id, used_at) WHERE used_at IS NULL;
