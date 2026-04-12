-- Create the users table
CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    preferences JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    token UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE
);

-- Enable Row Level Security (RLS) if you ever move reads/writes directly into
-- a public Supabase client. The current app keeps privileged database access on
-- the server side through Next.js API routes and the backend Python sender.

-- Comment explaining the JSON structure
COMMENT ON COLUMN users.preferences IS 'JSON structure: {"meals": ["breakfast", "lunch"], "stations": ["main line", "island 3"]}';

-- Create keep_alive table to prevent Supabase project pausing
CREATE TABLE IF NOT EXISTS keep_alive (
    id SERIAL PRIMARY KEY,
    last_run TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
