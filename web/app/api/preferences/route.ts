import { NextResponse } from "next/server";

import { getUserByToken, updatePreferencesByToken } from "@/lib/users";
import { isValidUuid, normalizePreferences } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token")?.trim() ?? "";

    if (!isValidUuid(token)) {
      return NextResponse.json({ error: "Invalid token." }, { status: 400 });
    }

    const user = await getUserByToken(token);
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      email: user.email,
      isActive: user.is_active,
      preferences: user.preferences ?? { meals: [], stations: [], days_ahead: 1 },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load preferences.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      meals?: string[];
      stations?: string[];
      days_ahead?: number;
    };

    const token = body.token?.trim() ?? "";
    if (!isValidUuid(token)) {
      return NextResponse.json({ error: "Invalid token." }, { status: 400 });
    }

    const preferences = normalizePreferences(body);
    const user = await updatePreferencesByToken(token, preferences);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      message: "Preferences updated successfully.",
      email: user.email,
      preferences: user.preferences ?? preferences,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update preferences.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
