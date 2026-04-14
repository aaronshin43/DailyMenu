import { DAYS_AHEAD_OPTIONS, MEALS, STATIONS } from "@/lib/constants";
import type { Meal, UserPreferences } from "@/lib/types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeWatchlist(value: unknown): string[] {
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
  return EMAIL_REGEX.test(email.trim());
}

export function isValidUuid(token: string): boolean {
  return UUID_REGEX.test(token.trim());
}

export function normalizePreferences(input: unknown): UserPreferences {
  const source = typeof input === "object" && input !== null ? input : {};
  const rawMeals = normalizeStringArray((source as { meals?: unknown }).meals);
  const rawStations = normalizeStringArray(
    (source as { stations?: unknown }).stations,
  );
  const rawWatchlist =
    (source as { watchlist?: unknown; watchlistText?: unknown }).watchlist ??
    (source as { watchlist?: unknown; watchlistText?: unknown }).watchlistText;
  const rawDaysAhead =
    (source as { days_ahead?: unknown; daysAhead?: unknown }).days_ahead ??
    (source as { days_ahead?: unknown; daysAhead?: unknown }).daysAhead;

  const meals = [...new Set(rawMeals)]
    .map((meal) => meal.toLowerCase())
    .filter((meal): meal is Meal =>
      (MEALS as readonly string[]).includes(meal),
    );
  const stations = [...new Set(rawStations)].filter((station) =>
    (STATIONS as readonly string[]).includes(station),
  );
  const watchlist = normalizeWatchlist(rawWatchlist);

  if (meals.length === 0) {
    throw new Error("Select at least one meal.");
  }

  if (stations.length === 0 && watchlist.length === 0) {
    throw new Error("Select at least one station or add watchlist items.");
  }

  const parsedDaysAhead = Number(rawDaysAhead ?? 1);
  const days_ahead = DAYS_AHEAD_OPTIONS.includes(parsedDaysAhead as 1 | 2)
    ? (parsedDaysAhead as 1 | 2)
    : 1;

  return { meals, stations, days_ahead, watchlist };
}
