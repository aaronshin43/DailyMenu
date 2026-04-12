export const MEALS = ["breakfast", "lunch", "dinner"] as const;
export const DAYS_AHEAD_OPTIONS = [1, 2] as const;

export const STATIONS = [
  "Main Line",
  "Island 3",
  "Soup",
  "Desserts",
  "Kove",
  "Gluten-Free",
  "Grill",
  "Salad Bar",
  "Special Salad Bar",
  "Fruit Bar",
  "Deli",
  "Sandwich Toppings",
  "Pizza",
  "Pasta Bar",
  "Sauce Bar",
  "TexMex",
  "Ice Cream Toppings",
] as const;

export const STATION_OPTIONS = [...STATIONS].sort();
export const STATION_ORDER = Object.fromEntries(
  STATIONS.map((station, index) => [station.toLowerCase(), index]),
);
