export type Meal = "breakfast" | "lunch" | "dinner";

export type UserPreferences = {
  meals: Meal[];
  stations: string[];
  days_ahead: 1 | 2;
};

export type MenuItem = {
  date: string;
  meal: Meal;
  station: string;
  name: string;
};

export type UserRecord = {
  email: string;
  token: string;
  is_active: boolean;
  preferences: UserPreferences | null;
};
