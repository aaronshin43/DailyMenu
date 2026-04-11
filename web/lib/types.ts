export type Meal = "breakfast" | "lunch" | "dinner";

export type UserPreferences = {
  meals: Meal[];
  stations: string[];
};

export type UserRecord = {
  email: string;
  token: string;
  is_active: boolean;
  preferences: UserPreferences | null;
};
