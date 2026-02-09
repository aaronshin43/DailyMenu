-- Create the users table
CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    preferences JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    token UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE
);

-- Enable Row Level Security (RLS) is recommended, but for this simple script service 
-- handling everything with a service_role key, we just need the table. 
-- However, if using the client side (Streamlit) with a public key, we might need policies.
-- Since Streamlit is a trusted backend (in this context), we will likely use the Service Role Key 
-- or a user with write access. For simplicity in this "Toy Project", we assume 
-- usage of the generic API keys provided by Supabase.

-- Comment explaining the JSON structure
COMMENT ON COLUMN users.preferences IS 'JSON structure: {"meals": ["breakfast", "lunch"], "stations": ["main line", "island 3"]}';

-- Create keep_alive table to prevent Supabase project pausing
CREATE TABLE IF NOT EXISTS keep_alive (
    id SERIAL PRIMARY KEY,
    last_run TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
