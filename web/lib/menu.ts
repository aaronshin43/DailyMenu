import { unstable_cache } from "next/cache";

import { MEALS, STATIONS, STATION_ORDER } from "@/lib/constants";
import type { Meal, MenuItem } from "@/lib/types";

const MENU_BASE_URL =
  "https://dickinson.api.nutrislice.com/menu/api/weeks/school/the-caf/menu-type";
const MENU_REVALIDATE_SECONDS = 60 * 30;

type NutrisliceDay = {
  date?: string;
  menu_items?: Array<{
    is_station_header?: boolean;
    text?: string;
    food?: {
      name?: string;
    };
  }>;
};

type NutrisliceResponse = {
  days?: NutrisliceDay[];
};

export type GroupedStationMenu = {
  station: string;
  items: MenuItem[];
};

export type GroupedMealMenu = {
  meal: Meal;
  stations: GroupedStationMenu[];
};

function formatPart(value: number): string {
  return String(value).padStart(2, "0");
}

function getNutrisliceUrl(date: Date, meal: Meal): string {
  return `${MENU_BASE_URL}/${meal}/${date.getFullYear()}/${formatPart(
    date.getMonth() + 1,
  )}/${formatPart(date.getDate())}/`;
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${formatPart(date.getMonth() + 1)}-${formatPart(
    date.getDate(),
  )}`;
}

function normalizeStationKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toDisplayTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeStationName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "General";
  }

  const stationKey = normalizeStationKey(trimmed);
  const matchedStation = STATIONS.find(
    (station) => normalizeStationKey(station) === stationKey,
  );

  return matchedStation ?? toDisplayTitle(trimmed);
}

function sortMenuItems(items: MenuItem[]): MenuItem[] {
  return [...items].sort((left, right) => {
    const mealCompare = MEALS.indexOf(left.meal) - MEALS.indexOf(right.meal);
    if (mealCompare !== 0) {
      return mealCompare;
    }

    const stationCompare =
      (STATION_ORDER[left.station.toLowerCase()] ?? 999) -
      (STATION_ORDER[right.station.toLowerCase()] ?? 999);
    if (stationCompare !== 0) {
      return stationCompare;
    }

    const stationNameCompare = left.station.localeCompare(right.station);
    if (stationNameCompare !== 0) {
      return stationNameCompare;
    }

    return left.name.localeCompare(right.name);
  });
}

async function fetchRawMenuForIsoDate(isoDate: string): Promise<MenuItem[]> {
  const date = new Date(`${isoDate}T00:00:00`);
  const menus = await Promise.all(
    MEALS.map(async (meal) => {
      const response = await fetch(getNutrisliceUrl(date, meal), {
        cache: "no-store",
      });

      if (!response.ok) {
        return { meal, data: null as NutrisliceResponse | null };
      }

      return {
        meal,
        data: (await response.json()) as NutrisliceResponse,
      };
    }),
  );

  const parsedItems: MenuItem[] = [];

  for (const { meal, data } of menus) {
    if (!data?.days?.length) {
      continue;
    }

    for (const day of data.days) {
      if (day.date !== isoDate) {
        continue;
      }

      let currentStation = "General";
      for (const item of day.menu_items ?? []) {
        if (item.is_station_header) {
          currentStation = normalizeStationName(item.text ?? "General");
          continue;
        }

        const foodName = item.food?.name?.trim();
        if (!foodName) {
          continue;
        }

        parsedItems.push({
          date: isoDate,
          meal,
          station: currentStation,
          name: foodName,
        });
      }
    }
  }

  return sortMenuItems(parsedItems);
}

function groupMenuItems(items: MenuItem[]): GroupedMealMenu[] {
  return MEALS.map((meal) => {
    const mealItems = items.filter((item) => item.meal === meal);
    const stationMap = new Map<string, MenuItem[]>();

    for (const item of mealItems) {
      if (!stationMap.has(item.station)) {
        stationMap.set(item.station, []);
      }
      stationMap.get(item.station)?.push(item);
    }

    const stations = [...stationMap.entries()]
      .sort((left, right) => {
        const leftOrder = STATION_ORDER[left[0].toLowerCase()] ?? 999;
        const rightOrder = STATION_ORDER[right[0].toLowerCase()] ?? 999;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return left[0].localeCompare(right[0]);
      })
      .map(([station, stationItems]) => ({
        station,
        items: stationItems.sort((left, right) => left.name.localeCompare(right.name)),
      }));

    return {
      meal,
      stations,
    };
  }).filter((mealGroup) => mealGroup.stations.length > 0);
}

const fetchGroupedMenuForIsoDateCached = unstable_cache(
  async (isoDate: string) => {
    const items = await fetchRawMenuForIsoDate(isoDate);
    return groupMenuItems(items);
  },
  ["grouped-menu-by-date"],
  {
    revalidate: MENU_REVALIDATE_SECONDS,
  },
);

export async function fetchGroupedMenuForDate(
  date: Date,
): Promise<GroupedMealMenu[]> {
  return fetchGroupedMenuForIsoDateCached(toIsoDate(date));
}

export function parseMenuDate(value?: string): Date {
  if (!value) {
    return new Date();
  }

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return new Date();
  }

  return parsedDate;
}
