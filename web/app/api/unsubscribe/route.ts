import { NextResponse } from "next/server";

import { deactivateUserByToken } from "@/lib/users";
import { isValidUuid } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string };
    const token = body.token?.trim() ?? "";

    if (!isValidUuid(token)) {
      return NextResponse.json({ error: "Invalid token." }, { status: 400 });
    }

    const user = await deactivateUserByToken(token);
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      email: user.email,
      message: "You have been unsubscribed.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to unsubscribe.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
