import { NextResponse } from "next/server";

import { confirmUserByToken } from "@/lib/users";
import { isValidUuid } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string };
    const token = body.token?.trim() ?? "";

    if (!isValidUuid(token)) {
      return NextResponse.json({ error: "Invalid token." }, { status: 400 });
    }

    const user = await confirmUserByToken(token);
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      email: user.email,
      message: user.is_active
        ? "Subscription confirmed. Daily emails will resume on the next send."
        : "Subscription could not be confirmed.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to confirm subscription.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
