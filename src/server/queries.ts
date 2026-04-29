import 'server-only';
import type {
  DayCalorieTotal,
  Entry,
  Food,
  MealItemWithFood,
  Profile,
  UserName,
} from '@/lib/types';

// Wave 1 stubs. Wave 2 Agent B replaces these with real Turso-backed queries.
// Signatures here are the contract — UI imports rely on them.

export async function getProfile(_name: UserName): Promise<Profile> {
  throw new Error('not implemented');
}

export async function getEntries(
  _userId: number,
  _fromDate?: string,
): Promise<Entry[]> {
  throw new Error('not implemented');
}

export async function getMealsForDate(
  _userId: number,
  _date: string,
): Promise<MealItemWithFood[]> {
  throw new Error('not implemented');
}

export async function listFoods(_opts?: {
  search?: string;
  includeArchived?: boolean;
}): Promise<Food[]> {
  throw new Error('not implemented');
}

export async function getRecentlyUsedFoods(
  _userId: number,
  _limit: number,
): Promise<Food[]> {
  throw new Error('not implemented');
}

export async function getDayCalorieTotals(
  _userId: number,
  _fromDate?: string,
): Promise<DayCalorieTotal[]> {
  throw new Error('not implemented');
}
