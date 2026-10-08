-- Run as postgres after switching every backend to a server-side Supabase key.
-- See README.md for the deployment order. No subscriber data is modified.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keep_alive ENABLE ROW LEVEL SECURITY;

-- Both tables are server-only. Token validation belongs to the Next.js routes;
-- it is not Supabase Auth and does not require an auth.uid() policy.
REVOKE ALL PRIVILEGES ON TABLE public.users, public.keep_alive
    FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.keep_alive_id_seq
    FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users, public.keep_alive
    TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.keep_alive_id_seq TO service_role;

COMMIT;
