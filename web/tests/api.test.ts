import assert from "node:assert/strict";
import { test } from "node:test";

import { createApiHandlers } from "../lib/api-handlers";
import { ApiError } from "../lib/api-errors";
import { clientIp, createRateLimiter, type LimitRule } from "../lib/rate-limit";
import { normalizePreferences } from "../lib/validators";
import type { UserRecord } from "../lib/types";

const token = "971f3aef-d3ec-42fa-8869-8706238f1646";
const confirmationToken = "f8354a4b-8914-4a34-8b9c-a553ad30d6c4";
const preferences = { meals: ["lunch" as const], stations: [], days_ahead: 2 as const, watchlist: ["ramen"] };
const payload = { email: " Student@Example.invalid ", ...preferences };
const user: UserRecord = { email: "student@example.invalid", token, is_active: false, preferences };
type Dependencies = Parameters<typeof createApiHandlers>[0];

function fixture(overrides: Partial<Dependencies> = {}) {
  const events: string[] = [];
  const deps: Dependencies = {
    limits: {
      ip: async () => { events.push("ip"); },
      email: async () => { events.push("email-limit"); },
      token: async (_token, write) => { events.push(write ? "token-write" : "token-read"); },
    },
    getUserByEmail: async () => { events.push("lookup-email"); return null; },
    getUserByToken: async () => { events.push("lookup-token"); return user; },
    upsertPendingUser: async (email, prefs) => {
      events.push("upsert"); assert.equal(email, user.email); assert.deepEqual(prefs, preferences);
      return { ...user, confirmation_token: confirmationToken };
    },
    updatePreferencesByToken: async () => { events.push("update"); return user; },
    confirmUserByToken: async () => { events.push("confirm"); return { ...user, is_active: true }; },
    deactivateUserByToken: async () => { events.push("unsubscribe"); return user; },
    sendEmail: async (email) => { events.push("send"); assert.equal(email, user.email); },
    generateConfirmationEmail: (value) => { assert.equal(value, confirmationToken); return "<p>confirmation</p>"; },
    generateManageLinkEmail: (value) => { assert.equal(value, token); return "<p>manage</p>"; },
    ...overrides,
  };
  return { events, deps, api: createApiHandlers(deps) };
}

function post(body: unknown, path = "subscribe") {
  return new Request(`http://localhost/api/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

test("subscribe reserves before lookup, mutations, and SMTP; watchlist allows no stations", async () => {
  const { api, events } = fixture();
  const response = await api.subscribe(post(payload));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mode, "subscribe");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(events, ["ip", "email-limit", "lookup-email", "upsert", "send"]);
});

test("existing active user gets manage link without token rotation or upsert", async () => {
  const { api, events } = fixture({ getUserByEmail: async () => ({ ...user, is_active: true }) });
  const response = await api.subscribe(post(payload));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mode, "manage-link");
  assert.deepEqual(events, ["ip", "email-limit", "send"]);
});

test("inactive subscriber retains resubscribe flow", async () => {
  const { api } = fixture({ getUserByEmail: async () => user });
  assert.equal((await (await api.subscribe(post(payload))).json()).mode, "resubscribe");
});

test("concurrent activation during signup returns management link and preserves active subscription", async () => {
  const { api, events } = fixture({ getUserByEmail: async () => user,
    upsertPendingUser: async () => ({ ...user, is_active: true, confirmation_token: null }) });
  const response = await api.subscribe(post(payload));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mode, "manage-link");
  assert.deepEqual(events, ["ip", "email-limit", "send"]);
});

test("missing confirmation token fails before SMTP and does not expose backend details", async (t) => {
  t.mock.method(console, "error", () => {});
  const { api, events } = fixture({ upsertPendingUser: async () => ({ ...user, confirmation_token: null }) });
  const response = await api.subscribe(post(payload));
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes("Missing confirmation token"));
  assert.ok(!events.includes("send"));
});

test("revoked, expired, replaced and legacy confirmation tokens return 410 with recovery guidance", async () => {
  const { api, events } = fixture({ confirmUserByToken: async () => null });
  const response = await api.confirm(post({ token }, "confirm"));
  assert.equal(response.status, 410);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match((await response.json()).error, /Subscribe again/);
  assert.deepEqual(events, ["ip", "token-write"]);
});

test("confirmation retries can succeed without exposing either bearer token", async () => {
  const { api } = fixture({ confirmUserByToken: async (value) => {
    assert.equal(value, confirmationToken);
    return { ...user, is_active: true };
  } });
  for (let i = 0; i < 2; i++) {
    const response = await api.confirm(post({ token: confirmationToken }, "confirm"));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.email, user.email);
    assert.ok(!JSON.stringify(result).includes(token));
    assert.ok(!JSON.stringify(result).includes(confirmationToken));
  }
});

test("email cooldown returns 429 + Retry-After before user mutation or send", async () => {
  const { api, events } = fixture({ limits: {
    ip: async () => {}, token: async () => {},
    email: async () => { throw new ApiError(429, "Wait before resending.", 60); },
  } });
  const response = await api.subscribe(post(payload));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.deepEqual(events, []);
});

test("invalid JSON/objects/types/preferences return 400 and never touch users or SMTP", async () => {
  const invalid = [null, [], "text", { ...payload, email: 42 }, { ...payload, email: "bad" },
    { ...payload, meals: "lunch" }, { ...payload, meals: [false] }, { ...payload, meals: [] },
    { ...payload, meals: ["snack"] }, { ...payload, stations: ["Unknown"] },
    { ...payload, stations: null }, { ...payload, watchlist: [7] }, { ...payload, watchlist: null },
    { ...payload, days_ahead: "2" }, { ...payload, days_ahead: false }, { ...payload, days_ahead: null },
    { ...payload, days_ahead: 3 }, { ...payload, stations: [], watchlist: [] }];
  for (const body of invalid) {
    const { api, events } = fixture();
    assert.equal((await api.subscribe(post(body))).status, 400, JSON.stringify(body));
    assert.deepEqual(events, ["ip"]);
  }
  const { api, events } = fixture();
  assert.equal((await api.subscribe(new Request("http://localhost/api/subscribe", { method: "POST", body: "{" }))).status, 400);
  assert.deepEqual(events, ["ip"]);
});

test("oversized body is bounded using actual bytes even with a misleading length header", async () => {
  const { api, events } = fixture();
  const request = new Request("http://localhost/api/subscribe", {
    method: "POST", body: JSON.stringify({ padding: "x".repeat(16384) }), headers: { "Content-Length": "1" },
  });
  assert.equal((await api.subscribe(request)).status, 413);
  assert.deepEqual(events, ["ip"]);
});

test("IP denial happens before parsing even malformed requests", async () => {
  const { api, events } = fixture({ limits: {
    email: async () => {}, token: async () => {},
    ip: async () => { throw new ApiError(429, "Wait.", 30); },
  } });
  assert.equal((await api.subscribe(new Request("http://localhost/api/subscribe", { method: "POST", body: "{" }))).status, 429);
  assert.deepEqual(events, []);
});

test("database failure fails closed with 503 and no SMTP or user mutation", async (t) => {
  t.mock.method(console, "error", () => {});
  const limits = createRateLimiter({ secret: "test-key", onVercel: true,
    consume: async () => { throw new Error("backend secret error"); } });
  const { api, events } = fixture({ limits });
  const response = await api.subscribe(post(payload));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "30");
  assert.ok(!(await response.text()).includes("backend secret"));
  assert.deepEqual(events, []);
});

test("unexpected backend errors are generic 500s", async (t) => {
  t.mock.method(console, "error", () => {});
  const { api } = fixture({ getUserByEmail: async () => { throw new Error("private database password"); } });
  const response = await api.subscribe(post(payload));
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes("private database"));
});

test("failed SMTP retains reservation; immediate retry cannot rotate token or resend", async (t) => {
  t.mock.method(console, "error", () => {});
  let emailReservations = 0;
  let sends = 0;
  const limits = createRateLimiter({ secret: "test-key", onVercel: false, consume: async (rules) => {
    if (rules.length === 2 && ++emailReservations > 1) return { allowed: false, retry_after_seconds: 60 };
    return { allowed: true, retry_after_seconds: 0 };
  } });
  const { api, events } = fixture({ limits, sendEmail: async () => { sends++; throw new Error("SMTP private failure"); } });
  assert.equal((await api.subscribe(post(payload))).status, 500);
  assert.equal((await api.subscribe(post(payload))).status, 429);
  assert.equal(sends, 1);
  assert.equal(events.filter((event) => event === "upsert").length, 1);
});

test("token read and all three writes use canonical token and appropriate limits", async () => {
  for (const method of ["getPreferences", "updatePreferences", "confirm", "unsubscribe"] as const) {
    const { api, events, deps } = fixture();
    const tokens: string[] = [];
    deps.limits.token = async (value, write) => {
      tokens.push(value); assert.equal(write, method !== "getPreferences");
    };
    const request = method === "getPreferences"
      ? new Request(`http://localhost/api/preferences?token=${token.toUpperCase()}`)
      : post({ token: token.toUpperCase(), ...preferences });
    const response = await api[method](request);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(tokens, [token]);
    assert.equal(events[0], "ip");
  }
});

test("token write/read denial precedes user lookup/mutation", async () => {
  const limits = { ip: async () => {}, email: async () => {}, token: async () => { throw new ApiError(429, "Wait.", 60); } };
  for (const method of ["getPreferences", "updatePreferences", "confirm", "unsubscribe"] as const) {
    const { api, events } = fixture({ limits });
    const request = method === "getPreferences"
      ? new Request(`http://localhost/api/preferences?token=${token}`) : post({ token, ...preferences });
    assert.equal((await api[method](request)).status, 429);
    assert.deepEqual(events, []);
  }
});

test("invalid token types are 400; missing manage tokens are 404 and confirmation tokens are 410", async () => {
  for (const method of ["updatePreferences", "confirm", "unsubscribe"] as const) {
    for (const value of [null, 1, [], {}, "invalid", undefined]) {
      const { api, events } = fixture();
      assert.equal((await api[method](post({ token: value, ...preferences }))).status, 400);
      assert.deepEqual(events, ["ip"]);
    }
  }
  const { api } = fixture({ getUserByToken: async () => null, confirmUserByToken: async () => null,
    updatePreferencesByToken: async () => null, deactivateUserByToken: async () => null });
  assert.equal((await api.getPreferences(new Request(`http://localhost/api/preferences?token=${token}`))).status, 404);
  for (const method of ["updatePreferences", "confirm", "unsubscribe"] as const) {
    assert.equal((await api[method](post({ token, ...preferences }))).status, method === "confirm" ? 410 : 404);
  }
});

test("watchlist normalization preserves case-insensitive dedupe and 15 x 60 limits", () => {
  const result = normalizePreferences({ ...preferences, watchlist: [" RAMEN ", "ramen", "x".repeat(70),
    ...Array.from({ length: 20 }, (_, i) => `item ${i}`)] });
  assert.equal(result.watchlist.length, 15);
  assert.equal(result.watchlist[0], "RAMEN");
  assert.equal(result.watchlist[1].length, 60);
  assert.deepEqual(normalizePreferences({ meals: ["lunch"], watchlistText: "ramen, soup", daysAhead: 2 }).watchlist,
    ["ramen", "soup"]);
});

test("only trusted Vercel IPs are used; local forwarded headers cannot create buckets", () => {
  const request = new Request("http://localhost", { headers: {
    "x-forwarded-for": "198.51.100.22", "x-vercel-forwarded-for": "198.51.100.10", "x-real-ip": "198.51.100.33",
  } });
  assert.equal(clientIp(request, true), "198.51.100.10");
  assert.equal(clientIp(request, false), "local");
  assert.equal(clientIp(new Request("http://localhost", { headers: { "x-forwarded-for": "198.51.100.22" } }), true), "unknown");
  for (const invalid of ["bad", "198.51.100.1, 198.51.100.2", "fe80::1%en0", ""]) {
    assert.equal(clientIp(new Request("http://localhost", { headers: { "x-vercel-forwarded-for": invalid } }), true), "unknown");
  }
  const ip1 = clientIp(new Request("http://localhost", { headers: { "x-vercel-forwarded-for": "2001:DB8:0:0::1" } }), true);
  const ip2 = clientIp(new Request("http://localhost", { headers: { "x-vercel-forwarded-for": "2001:db8::1" } }), true);
  assert.equal(ip1, ip2);
});

test("identities are HMACs; normalized email/token keys remain stable across IPs", async () => {
  const calls: LimitRule[][] = [];
  const limits = createRateLimiter({ secret: "test-key", onVercel: true, consume: async (rules) => {
    calls.push(rules); return { allowed: true, retry_after_seconds: 0 };
  } });
  await limits.email(" Student@Example.invalid ");
  await limits.email("student@example.invalid");
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0].map((rule) => [rule.limit, rule.window_seconds]), [[3, 3600], [1, 60]]);
  await limits.token(token.toUpperCase(), true);
  await limits.token(token, true);
  assert.deepEqual(calls[2], calls[3]);
  for (const rule of calls.flat()) {
    assert.match(rule.key, /^[a-z-]+:[a-f0-9]{64}$/);
    assert.ok(!rule.key.includes("example.invalid") && !rule.key.includes(token));
  }
});

test("malformed RPC responses fail closed", async (t) => {
  t.mock.method(console, "error", () => {});
  const limits = createRateLimiter({ secret: "test", onVercel: false,
    consume: async () => ({ allowed: false, retry_after_seconds: 0 }) });
  await assert.rejects(limits.email("student@example.invalid"), (error: unknown) => error instanceof ApiError && error.status === 503);
});
