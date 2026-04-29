// Wave 1 contract types — Wave 2 agents code against these.
// Field names here are the canonical source of truth across server actions,
// queries, and UI components. Do not deviate.

export type UserName = 'adam' | 'anna';

export interface Profile {
  id: number;
  name: UserName;
  displayName: string;
  heightIn: number | null;
  age: number | null;
  sex: 'm' | 'f' | null;
  startWeightLb: number | null;
  startDate: string | null; // YYYY-MM-DD
  targetWeightMinLb: number | null;
  targetWeightMaxLb: number | null;
  dailyCalorieTarget: number | null;
  dailyStepTarget: number | null;
}

export interface Entry {
  userId: number;
  date: string; // YYYY-MM-DD
  weightLb: number | null;
  steps: number | null;
  notes: string | null;
}

export interface Food {
  id: number;
  name: string;
  brand: string | null;
  servingLabel: string;
  caloriesPerServing: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  archived: boolean;
  createdBy: number | null;
  createdAt: string;
}

export interface MealItem {
  id: number;
  userId: number;
  date: string; // YYYY-MM-DD
  foodId: number;
  servings: number;
  createdAt: string;
}

export interface MealItemWithFood extends MealItem {
  food: Food;
}

export interface DayCalorieTotal {
  date: string;
  calories: number;
}
