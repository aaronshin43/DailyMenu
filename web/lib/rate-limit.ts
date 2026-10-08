import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { ApiError } from "@/lib/api-errors";

export type LimitRule = { key: string; limit: number; window_seconds: number };
export type LimitDecision = { allowed: boolean; retry_after_seconds: number };
export type ApiScope = "subscribe" | "token";

export function clientIp(request: Request, onVercel: boolean): string {
  // Vercel overwrites this platform header. Never trust arbitrary forwarded
  // headers on local/self-hosted servers; they share a fallback bucket instead.
  if (!onVercel) return "local";
  const value = request.headers.get("x-vercel-forwarded-for")?.trim() ?? "";
  if (isIP(value) === 4) return value;
  if (isIP(value) === 6) {
    try { return new URL(`http://[${value}]/`).hostname.toLowerCase(); }
    catch { return "unknown"; }
  }
  return "unknown";
}

export function createRateLimiter(options: {
  secret: string;
  onVercel: boolean;
  consume: (rules: LimitRule[]) => Promise<LimitDecision>;
}) {
  const rule = (scope: string, identity: string, limit: number, window: number): LimitRule => ({
    key: `${scope}:${createHmac("sha256", options.secret).update(`${scope}\0${identity}`).digest("hex")}`,
    limit,
    window_seconds: window,
  });

  async function reserve(rules: LimitRule[]): Promise<void> {
    let decision: LimitDecision;
    try {
      decision = await options.consume(rules);
      if (typeof decision?.allowed !== "boolean" || !Number.isInteger(decision.retry_after_seconds)
          || decision.retry_after_seconds < 0 || (!decision.allowed && decision.retry_after_seconds < 1)) {
        throw new Error("Invalid rate-limit response");
      }
    } catch {
      console.error("API rate-limit database check failed.");
      throw new ApiError(503, "Service temporarily unavailable. Please try again shortly.", 30);
    }
    if (!decision.allowed) {
      throw new ApiError(429, `Too many requests. Try again in ${decision.retry_after_seconds} seconds.`, decision.retry_after_seconds);
    }
  }

  return {
    async ip(request: Request, scope: ApiScope) {
      await reserve([scope === "subscribe"
        ? rule("subscribe-ip", clientIp(request, options.onVercel), 30, 600)
        : rule("token-ip", clientIp(request, options.onVercel), 120, 60)]);
    },
    async email(email: string) {
      await reserve([
        rule("email-hour", email.trim().toLowerCase(), 3, 3600),
        rule("email-cooldown", email.trim().toLowerCase(), 1, 60),
      ]);
    },
    async token(token: string, write: boolean) {
      await reserve([write
        ? rule("token-write", token.toLowerCase(), 20, 60)
        : rule("token-read", token.toLowerCase(), 60, 60)]);
    },
  };
}
