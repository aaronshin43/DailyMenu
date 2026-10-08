import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PreparedSubscription, UserPreferences, UserRecord } from "@/lib/types";

type SupabaseUserRow = {
  email: string;
  token: string;
  is_active: boolean;
  preferences: UserPreferences | null;
};

function coerceUserRecord(row: SupabaseUserRow): UserRecord {
  const preferences = row.preferences ?? {
    meals: [],
    stations: [],
    days_ahead: 1 as const,
    watchlist: [],
  };

  return {
    email: row.email,
    token: row.token,
    is_active: row.is_active === true,
    preferences: {
      meals: preferences.meals ?? [],
      stations: preferences.stations ?? [],
      days_ahead:
        preferences.days_ahead === 2 || preferences.days_ahead === 1
          ? preferences.days_ahead
          : 1,
      watchlist: Array.isArray(preferences.watchlist)
        ? preferences.watchlist.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
    },
  };
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("email, token, is_active, preferences")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? coerceUserRecord(data as SupabaseUserRow) : null;
}

export async function getUserByToken(token: string): Promise<UserRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("email, token, is_active, preferences")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? coerceUserRecord(data as SupabaseUserRow) : null;
}

export async function upsertPendingUser(
  email: string,
  preferences: UserPreferences,
): Promise<PreparedSubscription> {
  const { data, error } = await supabaseAdmin
    .rpc("prepare_menu_subscription", { p_email: email, p_preferences: preferences })
    .single();

  if (error) {
    throw error;
  }

  const row = data as SupabaseUserRow & { confirmation_token: string | null };
  return { ...coerceUserRecord(row), confirmation_token: row.confirmation_token };
}

export async function updatePreferencesByToken(
  token: string,
  preferences: UserPreferences,
): Promise<UserRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .update({ preferences })
    .eq("token", token)
    .select("email, token, is_active, preferences")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? coerceUserRecord(data as SupabaseUserRow) : null;
}

export async function confirmUserByToken(token: string): Promise<UserRecord | null> {
  const { data, error } = await supabaseAdmin
    .rpc("confirm_menu_subscription", { p_token: token })
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? coerceUserRecord(data as SupabaseUserRow) : null;
}

export async function deactivateUserByToken(
  token: string,
): Promise<UserRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .update({ is_active: false })
    .eq("token", token)
    .select("email, token, is_active, preferences")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? coerceUserRecord(data as SupabaseUserRow) : null;
}
