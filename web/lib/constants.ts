export const MEALS = ["breakfast", "lunch", "dinner"] as const;
export const DAYS_AHEAD_OPTIONS = [1, 2] as const;

export const STATIONS = [
  "Deli",
  "Desserts",
  "Fruit Bar",
  "Gluten Free",
  "Grill",
  "Ice Cream Toppings",
  "Island 3",
  "Kove",
  "Main Line",
  "Pasta Bar",
  "Pizza",
  "Salad Bar",
  "Sandwich Toppings",
  "Sauce Bar",
  "Soup",
  "Special Salad Bar",
  "TexMex",
] as const;

export const STATION_OPTIONS = [...STATIONS].sort();
export const STATION_ORDER = Object.fromEntries(
  STATIONS.map((station, index) => [station.toLowerCase(), index]),
);
