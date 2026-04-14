import { unstable_cache } from "next/cache";

import { MEALS, STATIONS, STATION_ORDER } from "@/lib/constants";
import type { Meal, MenuFoodIcon, MenuItem, NutritionInfo, ServingSizeInfo } from "@/lib/types";

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

type NutrisliceFoodIcon = {
  name?: string;
  slug?: string | null;
  help_text?: string | null;
  custom_icon_url?: string | null;
};

type NutrisliceFood = {
  name?: string;
  ingredients?: string | null;
  rounded_nutrition_info?: Partial<NutritionInfo> | null;
  serving_size_info?: {
    serving_size_amount?: string | null;
    serving_size_unit?: string | null;
  } | null;
  icons?: {
    food_icons?: NutrisliceFoodIcon[];
  } | null;
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

function normalizeFoodIcons(food: NutrisliceFood | undefined): MenuFoodIcon[] {
  const icons = food?.icons?.food_icons ?? [];
  return icons
    .filter((icon) => icon.custom_icon_url || icon.name)
    .map((icon) => ({
      name: icon.name?.trim() || "Food icon",
      slug: icon.slug?.trim() || null,
      helpText: icon.help_text?.trim() || null,
      customIconUrl: icon.custom_icon_url?.trim() || null,
    }));
}

function normalizeServingSize(food: NutrisliceFood | undefined): ServingSizeInfo | null {
  const servingSize = food?.serving_size_info;
  if (!servingSize) {
    return null;
  }

  const amount = servingSize.serving_size_amount?.trim() || null;
  const unit = servingSize.serving_size_unit?.trim() || null;

  if (!amount && !unit) {
    return null;
  }

  return { amount, unit };
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeNutritionInfo(food: NutrisliceFood | undefined): NutritionInfo | null {
  const nutrition = food?.rounded_nutrition_info;
  if (!nutrition) {
    return null;
  }

  const normalized: NutritionInfo = {
    calories: toNullableNumber(nutrition.calories),
    g_fat: toNullableNumber(nutrition.g_fat),
    g_saturated_fat: toNullableNumber(nutrition.g_saturated_fat),
    g_trans_fat: toNullableNumber(nutrition.g_trans_fat),
    mg_cholesterol: toNullableNumber(nutrition.mg_cholesterol),
    mg_sodium: toNullableNumber(nutrition.mg_sodium),
    g_carbs: toNullableNumber(nutrition.g_carbs),
    g_fiber: toNullableNumber(nutrition.g_fiber),
    g_sugar: toNullableNumber(nutrition.g_sugar),
    g_added_sugar: toNullableNumber(nutrition.g_added_sugar),
    g_protein: toNullableNumber(nutrition.g_protein),
    mg_calcium: toNullableNumber(nutrition.mg_calcium),
    mg_iron: toNullableNumber(nutrition.mg_iron),
    mg_potassium: toNullableNumber(nutrition.mg_potassium),
    mg_vitamin_c: toNullableNumber(nutrition.mg_vitamin_c),
    mg_vitamin_d: toNullableNumber(nutrition.mg_vitamin_d),
  };

  return Object.values(normalized).some((value) => value !== null)
    ? normalized
    : null;
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

        const food = item.food as NutrisliceFood | undefined;
        const foodName = food?.name?.trim();
        if (!foodName) {
          continue;
        }

        parsedItems.push({
          date: isoDate,
          meal,
          station: currentStation,
          name: foodName,
          calories: toNullableNumber(food?.rounded_nutrition_info?.calories),
          nutritionInfo: normalizeNutritionInfo(food),
          ingredients: food?.ingredients?.trim() || null,
          icons: normalizeFoodIcons(food),
          servingSize: normalizeServingSize(food),
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
  ["grouped-menu-by-date-v2"],
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
