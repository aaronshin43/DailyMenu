import { MEALS, STATIONS } from "@/lib/constants";
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

  const meals = [...new Set(rawMeals)]
    .map((meal) => meal.toLowerCase())
    .filter((meal): meal is Meal =>
      (MEALS as readonly string[]).includes(meal),
    );
  const stations = [...new Set(rawStations)].filter((station) =>
    (STATIONS as readonly string[]).includes(station),
  );

  if (meals.length === 0) {
    throw new Error("Select at least one meal.");
  }

  if (stations.length === 0) {
    throw new Error("Select at least one station.");
  }

  return { meals, stations };
}
