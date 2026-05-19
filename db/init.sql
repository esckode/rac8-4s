-- PostgreSQL Initialization Script
-- This script runs once when the PostgreSQL container starts
-- It creates schemas and sets up permissions

-- Create public schema (already exists by default, but being explicit)
CREATE SCHEMA IF NOT EXISTS public;

-- Create auth schema for authentication-related tables
CREATE SCHEMA IF NOT EXISTS auth;

-- Grant all privileges on schemas to tournament_user
GRANT ALL PRIVILEGES ON SCHEMA public TO tournament_user;
GRANT ALL PRIVILEGES ON SCHEMA auth TO tournament_user;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO tournament_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO tournament_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO tournament_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL PRIVILEGES ON TABLES TO tournament_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL PRIVILEGES ON SEQUENCES TO tournament_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT USAGE, SELECT ON SEQUENCES TO tournament_user;

-- Log initialization
SELECT 'PostgreSQL initialization complete - schemas created and permissions set';
