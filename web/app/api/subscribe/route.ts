import { NextResponse } from "next/server";

import {
  generateConfirmationEmail,
  generateManageLinkEmail,
} from "@/lib/email-templates";
import { sendEmail } from "@/lib/email";
import { getUserByEmail, upsertPendingUser } from "@/lib/users";
import { isValidEmail, normalizePreferences } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      meals?: string[];
      stations?: string[];
      days_ahead?: number;
    };

    const email = body.email?.trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    const preferences = normalizePreferences(body);
    const existingUser = await getUserByEmail(email);

    if (existingUser?.is_active) {
      await sendEmail(
        email,
        "Manage your Dickinson Daily Menu preferences",
        generateManageLinkEmail(existingUser.token),
      );

      return NextResponse.json({
        mode: "manage-link",
        message:
          "You are already subscribed. We sent a secure link to manage your preferences.",
      });
    }

    const pendingUser = await upsertPendingUser(email, preferences);

    await sendEmail(
      email,
      "Confirm your Dickinson Daily Subscription",
      generateConfirmationEmail(pendingUser.token),
    );

    return NextResponse.json({
      mode: existingUser ? "resubscribe" : "subscribe",
      message:
        "Confirmation email sent. Check your inbox and click the link to activate your subscription.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to process subscription.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
