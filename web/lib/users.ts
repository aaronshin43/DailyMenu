import { randomUUID } from "crypto";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { UserPreferences, UserRecord } from "@/lib/types";

type SupabaseUserRow = {
  email: string;
  token: string;
  is_active: boolean;
  preferences: UserPreferences | null;
};

function coerceUserRecord(row: SupabaseUserRow): UserRecord {
  return {
    email: row.email,
    token: row.token,
    is_active: row.is_active,
    preferences: row.preferences,
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
): Promise<UserRecord> {
  const payload = {
    email,
    token: randomUUID(),
    preferences,
    is_active: false,
  };

  const { data, error } = await supabaseAdmin
    .from("users")
    .upsert(payload, { onConflict: "email" })
    .select("email, token, is_active, preferences")
    .single();

  if (error) {
    throw error;
  }

  return coerceUserRecord(data as SupabaseUserRow);
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
    .from("users")
    .update({ is_active: true })
    .eq("token", token)
    .select("email, token, is_active, preferences")
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
