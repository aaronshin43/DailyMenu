export type Meal = "breakfast" | "lunch" | "dinner";

export type MenuFoodIcon = {
  name: string;
  slug: string | null;
  helpText: string | null;
  customIconUrl: string | null;
};

export type NutritionInfo = {
  calories: number | null;
  g_fat: number | null;
  g_saturated_fat: number | null;
  g_trans_fat: number | null;
  mg_cholesterol: number | null;
  mg_sodium: number | null;
  g_carbs: number | null;
  g_fiber: number | null;
  g_sugar: number | null;
  g_added_sugar: number | null;
  g_protein: number | null;
  mg_calcium: number | null;
  mg_iron: number | null;
  mg_potassium: number | null;
  mg_vitamin_c: number | null;
  mg_vitamin_d: number | null;
};

export type ServingSizeInfo = {
  amount: string | null;
  unit: string | null;
};

export type UserPreferences = {
  meals: Meal[];
  stations: string[];
  days_ahead: 1 | 2;
  watchlist: string[];
};

export type MenuItem = {
  date: string;
  meal: Meal;
  station: string;
  name: string;
  calories: number | null;
  nutritionInfo: NutritionInfo | null;
  ingredients: string | null;
  icons: MenuFoodIcon[];
  servingSize: ServingSizeInfo | null;
};

export type UserRecord = {
  email: string;
  token: string;
  is_active: boolean;
  preferences: UserPreferences | null;
};
