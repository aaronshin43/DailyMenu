import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "@/lib/config";

const { url, serviceRoleKey } = getSupabaseConfig();

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
