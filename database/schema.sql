-- Run as postgres. Create tables and protect them in the same transaction.
-- Also install api_rate_limits.sql and confirmation_lifecycle.sql before deploying the subscription API.
BEGIN;

-- Create the users table
CREATE TABLE IF NOT EXISTS public.users (
    email TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    preferences JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    token UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE
);

-- Comment explaining the JSON structure
COMMENT ON COLUMN public.users.preferences IS 'JSON structure: {"meals": ["breakfast", "lunch"], "stations": ["main line", "island 3"], "days_ahead": 1, "watchlist": ["ramen"]}';

-- Create keep_alive table to prevent Supabase project pausing
CREATE TABLE IF NOT EXISTS public.keep_alive (
    id SERIAL PRIMARY KEY,
    last_run TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Server-only tables: keep these rules in sync with protect_server_tables.sql.
-- Next.js and the Python sender use service_role keys only on the server.
-- There are no client policies: the app validates manage/confirm/unsubscribe
-- tokens in its API routes, without a Supabase Auth login/session system.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keep_alive ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.users, public.keep_alive
    FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.keep_alive_id_seq
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users, public.keep_alive
    TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.keep_alive_id_seq TO service_role;

COMMIT;
