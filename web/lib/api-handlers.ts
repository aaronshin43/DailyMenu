import { jsonResponse, readJsonObject, withApiErrors } from "@/lib/api-errors";
import { normalizePreferences, parseEmail, parseToken } from "@/lib/validators";
import type { createRateLimiter } from "@/lib/rate-limit";
import type { PreparedSubscription, UserPreferences, UserRecord } from "@/lib/types";

type Dependencies = {
  limits: ReturnType<typeof createRateLimiter>;
  getUserByEmail: (email: string) => Promise<UserRecord | null>;
  getUserByToken: (token: string) => Promise<UserRecord | null>;
  upsertPendingUser: (email: string, preferences: UserPreferences) => Promise<PreparedSubscription>;
  updatePreferencesByToken: (token: string, preferences: UserPreferences) => Promise<UserRecord | null>;
  confirmUserByToken: (token: string) => Promise<UserRecord | null>;
  deactivateUserByToken: (token: string) => Promise<UserRecord | null>;
  sendEmail: (to: string, subject: string, html: string) => Promise<void>;
  generateConfirmationEmail: (token: string) => string;
  generateManageLinkEmail: (token: string) => string;
};

export function createApiHandlers(deps: Dependencies) {
  const notFound = () => jsonResponse({ error: "User not found." }, 404);

  async function sendManageLink(user: UserRecord) {
    await deps.sendEmail(user.email, "Manage your Dickinson Daily Menu preferences",
      deps.generateManageLinkEmail(user.token));
    return jsonResponse({ mode: "manage-link", message:
      "You are already subscribed. We sent a secure link to manage your preferences." });
  }

  async function writeToken(request: Request): Promise<{ token: string; body: Record<string, unknown> }> {
    await deps.limits.ip(request, "token");
    const body = await readJsonObject(request);
    const token = parseToken(body.token);
    await deps.limits.token(token, true);
    return { token, body };
  }

  return {
    subscribe: (request: Request) => withApiErrors(async () => {
      // Count malformed requests too. Reserve email budgets only after validation
      // and before any user mutation or SMTP send; no release on uncertain sends.
      await deps.limits.ip(request, "subscribe");
      const body = await readJsonObject(request);
      const email = parseEmail(body.email);
      const preferences = normalizePreferences(body);
      await deps.limits.email(email);
      const existingUser = await deps.getUserByEmail(email);
      if (existingUser?.is_active) {
        return sendManageLink(existingUser);
      }
      const user = await deps.upsertPendingUser(email, preferences);
      // The database can observe a concurrent confirmation after our lookup.
      if (user.is_active) return sendManageLink(user);
      if (!user.confirmation_token) throw new Error("Missing confirmation token.");
      await deps.sendEmail(email, "Confirm your Dickinson Daily Subscription",
        deps.generateConfirmationEmail(user.confirmation_token));
      return jsonResponse({ mode: existingUser ? "resubscribe" : "subscribe", message:
        "Confirmation email sent. Check your inbox and click the link to activate your subscription." });
    }),

    getPreferences: (request: Request) => withApiErrors(async () => {
      await deps.limits.ip(request, "token");
      const token = parseToken(new URL(request.url).searchParams.get("token"));
      await deps.limits.token(token, false);
      const user = await deps.getUserByToken(token);
      if (!user) return notFound();
      return jsonResponse({ email: user.email, isActive: user.is_active, preferences:
        user.preferences ?? { meals: [], stations: [], days_ahead: 1, watchlist: [] } });
    }),

    updatePreferences: (request: Request) => withApiErrors(async () => {
      const { token, body } = await writeToken(request);
      const preferences = normalizePreferences(body);
      const user = await deps.updatePreferencesByToken(token, preferences);
      if (!user) return notFound();
      return jsonResponse({ message: "Preferences updated successfully.", email: user.email,
        preferences: user.preferences ?? preferences });
    }),

    confirm: (request: Request) => withApiErrors(async () => {
      const { token } = await writeToken(request);
      const user = await deps.confirmUserByToken(token);
      if (!user) return jsonResponse({ error:
        "This confirmation link has expired or is no longer valid. Subscribe again to get a new link." }, 410);
      return jsonResponse({ email: user.email, message: user.is_active
        ? "Subscription confirmed. Daily emails will resume on the next send."
        : "Subscription could not be confirmed." });
    }),

    unsubscribe: (request: Request) => withApiErrors(async () => {
      const { token } = await writeToken(request);
      const user = await deps.deactivateUserByToken(token);
      if (!user) return notFound();
      return jsonResponse({ email: user.email, message: "You have been unsubscribed." });
    }),
  };
}
