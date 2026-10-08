import { DAYS_AHEAD_OPTIONS, MEALS, STATIONS } from "@/lib/constants";
import type { Meal, UserPreferences } from "@/lib/types";
import { ValidationError } from "@/lib/api-errors";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ValidationError(`${field} must be an array of strings.`);
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeWatchlist(value: unknown): string[] {
  if (value !== undefined && typeof value !== "string"
      && (!Array.isArray(value) || value.some((item) => typeof item !== "string"))) {
    throw new ValidationError("watchlist must be text or an array of strings.");
  }
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]+/)
      : [];

  const dedupeKeys = new Set<string>();
  const normalizedItems: string[] = [];

  for (const rawItem of rawItems) {
    if (typeof rawItem !== "string") {
      continue;
    }

    const normalized = rawItem.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!normalized) {
      continue;
    }

    const dedupeKey = normalized.toLowerCase();
    if (dedupeKeys.has(dedupeKey)) {
      continue;
    }

    dedupeKeys.add(dedupeKey);
    normalizedItems.push(normalized);
  }

  return normalizedItems.slice(0, 15);
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_REGEX.test(email.trim());
}

export function isValidUuid(token: string): boolean {
  return UUID_REGEX.test(token.trim());
}

export function normalizePreferences(input: unknown): UserPreferences {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("Preferences must be a JSON object.");
  }
  const source = input as Record<string, unknown>;
  const rawMeals = normalizeStringArray(source.meals, "meals");
  const rawStations = normalizeStringArray(
    source.stations, "stations",
  );
  const rawWatchlist = source.watchlist !== undefined ? source.watchlist : source.watchlistText;
  const rawDaysAhead = source.days_ahead !== undefined ? source.days_ahead : source.daysAhead;

  const meals = [...new Set(rawMeals)]
    .map((meal) => meal.toLowerCase())
    .filter((meal): meal is Meal =>
      (MEALS as readonly string[]).includes(meal),
    );
  const stations = [...new Set(rawStations)].filter((station) =>
    (STATIONS as readonly string[]).includes(station),
  );
  const watchlist = normalizeWatchlist(rawWatchlist);

  if (rawMeals.some((meal) => !(MEALS as readonly string[]).includes(meal.toLowerCase()))) {
    throw new ValidationError("Unknown meal selection.");
  }
  if (rawStations.some((station) => !(STATIONS as readonly string[]).includes(station))) {
    throw new ValidationError("Unknown station selection.");
  }

  if (meals.length === 0) {
    throw new ValidationError("Select at least one meal.");
  }

  if (stations.length === 0 && watchlist.length === 0) {
    throw new ValidationError("Select at least one station or add watchlist items.");
  }

  if (rawDaysAhead !== undefined && (typeof rawDaysAhead !== "number"
      || !DAYS_AHEAD_OPTIONS.includes(rawDaysAhead as 1 | 2))) {
    throw new ValidationError("days_ahead must be 1 or 2.");
  }
  const days_ahead = (rawDaysAhead ?? 1) as 1 | 2;

  return { meals, stations, days_ahead, watchlist };
}

export function parseEmail(value: unknown): string {
  if (typeof value !== "string" || !isValidEmail(value.trim())) {
    throw new ValidationError("Enter a valid email address.");
  }
  return value.trim().toLowerCase();
}

export function parseToken(value: unknown): string {
  if (typeof value !== "string" || !isValidUuid(value)) {
    throw new ValidationError("Invalid token.");
  }
  return value.trim().toLowerCase();
}
