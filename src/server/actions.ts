'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import {
  getMealItemWithFoodById,
  getProfile,
} from '@/server/queries';
import type {
  Entry,
  Food,
  MealItemWithFood,
  Profile,
  UserName,
} from '@/lib/types';

// ---------- shared schema fragments ----------

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'date must be YYYY-MM-DD',
});

const userNameEnum = z.enum(['adam', 'anna']);
const sexEnum = z.enum(['m', 'f']);

// Helper: throw with a clear, user-readable error from a ZodError.
function parseOrThrow<T>(
  schema: z.ZodType<T>,
  input: unknown,
  label: string,
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`${label} validation failed: ${issues}`);
  }
  return result.data;
}

// ---------- revalidation helpers ----------

function revalidateEntryPaths(name: UserName) {
  revalidatePath(`/${name}/dashboard`);
  revalidatePath(`/${name}/today`);
}

function revalidateMealPaths(name: UserName) {
  revalidatePath(`/${name}/dashboard`);
  revalidatePath(`/${name}/today`);
}

function revalidateFoodPaths() {
  // Foods are shared across both users.
  revalidatePath(`/adam/foods`);
  revalidatePath(`/anna/foods`);
  revalidatePath(`/adam/today`);
  revalidatePath(`/anna/today`);
}

async function userNameById(id: number): Promise<UserName> {
  const db = getDb();
  const r = await db.execute({
    sql: 'SELECT name FROM users WHERE id = ? LIMIT 1',
    args: [id],
  });
  const row = r.rows[0];
  if (!row) throw new Error(`User id=${id} not found`);
  const name = String(row.name);
  if (name !== 'adam' && name !== 'anna') {
    throw new Error(`Unexpected user name '${name}'`);
  }
  return name;
}

// ---------- updateProfile ----------

const updateProfileSchema = z.object({
  name: userNameEnum,
  heightIn: z.number().positive().nullable().optional(),
  age: z.number().int().positive().nullable().optional(),
  sex: sexEnum.nullable().optional(),
  startWeightLb: z.number().positive().nullable().optional(),
  startDate: dateString.nullable().optional(),
  targetWeightMinLb: z.number().positive().nullable().optional(),
  targetWeightMaxLb: z.number().positive().nullable().optional(),
  dailyCalorieTarget: z.number().int().positive().nullable().optional(),
  dailyStepTarget: z.number().int().positive().nullable().optional(),
});

export async function updateProfile(input: unknown): Promise<Profile> {
  const data = parseOrThrow(updateProfileSchema, input, 'updateProfile');

  // Build a dynamic UPDATE for only the fields that were provided.
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  const push = (col: string, value: unknown) => {
    sets.push(`${col} = ?`);
    args.push(value as string | number | null);
  };

  if ('heightIn' in data) push('height_in', data.heightIn ?? null);
  if ('age' in data) push('age', data.age ?? null);
  if ('sex' in data) push('sex', data.sex ?? null);
  if ('startWeightLb' in data) push('start_weight_lb', data.startWeightLb ?? null);
  if ('startDate' in data) push('start_date', data.startDate ?? null);
  if ('targetWeightMinLb' in data)
    push('target_weight_min_lb', data.targetWeightMinLb ?? null);
  if ('targetWeightMaxLb' in data)
    push('target_weight_max_lb', data.targetWeightMaxLb ?? null);
  if ('dailyCalorieTarget' in data)
    push('daily_calorie_target', data.dailyCalorieTarget ?? null);
  if ('dailyStepTarget' in data)
    push('daily_step_target', data.dailyStepTarget ?? null);

  if (sets.length > 0) {
    const db = getDb();
    args.push(data.name);
    await db.execute({
      sql: `UPDATE users SET ${sets.join(', ')} WHERE name = ?`,
      args,
    });
  }

  const profile = await getProfile(data.name);
  revalidatePath(`/${data.name}/profile`);
  revalidatePath(`/${data.name}/dashboard`);
  revalidatePath(`/${data.name}/today`);
  return profile;
}

// ---------- upsertEntry ----------

const upsertEntrySchema = z.object({
  userId: z.number().int().positive(),
  date: dateString,
  weightLb: z.number().positive().nullable().optional(),
  steps: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function upsertEntry(input: unknown): Promise<Entry> {
  const data = parseOrThrow(upsertEntrySchema, input, 'upsertEntry');
  const db = getDb();

  // For a brand-new row, undefined → NULL columns. For an existing row,
  // COALESCE(excluded.col, entries.col) preserves the prior value when the
  // input field is undefined.
  const weight = data.weightLb === undefined ? null : data.weightLb;
  const steps = data.steps === undefined ? null : data.steps;
  const notes = data.notes === undefined ? null : data.notes;

  await db.execute({
    sql: `INSERT INTO entries (user_id, date, weight_lb, steps, notes)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, date) DO UPDATE SET
            weight_lb = COALESCE(excluded.weight_lb, entries.weight_lb),
            steps     = COALESCE(excluded.steps,     entries.steps),
            notes     = COALESCE(excluded.notes,     entries.notes)`,
    args: [data.userId, data.date, weight, steps, notes],
  });

  const result = await db.execute({
    sql: `SELECT user_id, date, weight_lb, steps, notes
            FROM entries
           WHERE user_id = ? AND date = ?
           LIMIT 1`,
    args: [data.userId, data.date],
  });
  const row = result.rows[0];
  if (!row) throw new Error('upsertEntry: failed to read back entry');
  const entry: Entry = {
    userId: Number(row.user_id),
    date: String(row.date),
    weightLb:
      row.weight_lb === null || row.weight_lb === undefined
        ? null
        : Number(row.weight_lb),
    steps:
      row.steps === null || row.steps === undefined ? null : Number(row.steps),
    notes:
      row.notes === null || row.notes === undefined ? null : String(row.notes),
  };

  const name = await userNameById(data.userId);
  revalidateEntryPaths(name);
  return entry;
}

// ---------- createFood ----------

const createFoodSchema = z.object({
  name: z.string().min(1),
  brand: z.string().nullable().optional(),
  servingLabel: z.string().min(1),
  caloriesPerServing: z.number().int().positive(),
  proteinG: z.number().nonnegative().nullable().optional(),
  carbsG: z.number().nonnegative().nullable().optional(),
  fatG: z.number().nonnegative().nullable().optional(),
  createdBy: z.number().int().positive().nullable().optional(),
});

export async function createFood(input: unknown): Promise<Food> {
  const data = parseOrThrow(createFoodSchema, input, 'createFood');
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO foods
            (name, brand, serving_label, calories_per_serving,
             protein_g, carbs_g, fat_g, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id, name, brand, serving_label, calories_per_serving,
                    protein_g, carbs_g, fat_g, archived, created_by, created_at`,
    args: [
      data.name,
      data.brand ?? null,
      data.servingLabel,
      data.caloriesPerServing,
      data.proteinG ?? null,
      data.carbsG ?? null,
      data.fatG ?? null,
      data.createdBy ?? null,
    ],
  });
  const row = result.rows[0];
  if (!row) throw new Error('createFood: insert did not return a row');

  const food: Food = {
    id: Number(row.id),
    name: String(row.name),
    brand:
      row.brand === null || row.brand === undefined ? null : String(row.brand),
    servingLabel: String(row.serving_label),
    caloriesPerServing: Number(row.calories_per_serving),
    proteinG:
      row.protein_g === null || row.protein_g === undefined
        ? null
        : Number(row.protein_g),
    carbsG:
      row.carbs_g === null || row.carbs_g === undefined
        ? null
        : Number(row.carbs_g),
    fatG:
      row.fat_g === null || row.fat_g === undefined ? null : Number(row.fat_g),
    archived: Number(row.archived) !== 0,
    createdBy:
      row.created_by === null || row.created_by === undefined
        ? null
        : Number(row.created_by),
    createdAt: String(row.created_at),
  };

  revalidateFoodPaths();
  return food;
}

// ---------- updateFood ----------

const updateFoodSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).optional(),
  brand: z.string().nullable().optional(),
  servingLabel: z.string().min(1).optional(),
  caloriesPerServing: z.number().int().positive().optional(),
  proteinG: z.number().nonnegative().nullable().optional(),
  carbsG: z.number().nonnegative().nullable().optional(),
  fatG: z.number().nonnegative().nullable().optional(),
});

export async function updateFood(input: unknown): Promise<Food> {
  const data = parseOrThrow(updateFoodSchema, input, 'updateFood');
  const db = getDb();

  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const push = (col: string, value: unknown) => {
    sets.push(`${col} = ?`);
    args.push(value as string | number | null);
  };

  if ('name' in data && data.name !== undefined) push('name', data.name);
  if ('brand' in data) push('brand', data.brand ?? null);
  if ('servingLabel' in data && data.servingLabel !== undefined)
    push('serving_label', data.servingLabel);
  if ('caloriesPerServing' in data && data.caloriesPerServing !== undefined)
    push('calories_per_serving', data.caloriesPerServing);
  if ('proteinG' in data) push('protein_g', data.proteinG ?? null);
  if ('carbsG' in data) push('carbs_g', data.carbsG ?? null);
  if ('fatG' in data) push('fat_g', data.fatG ?? null);

  if (sets.length > 0) {
    args.push(data.id);
    await db.execute({
      sql: `UPDATE foods SET ${sets.join(', ')} WHERE id = ?`,
      args,
    });
  }

  const result = await db.execute({
    sql: `SELECT id, name, brand, serving_label, calories_per_serving,
                 protein_g, carbs_g, fat_g, archived, created_by, created_at
            FROM foods WHERE id = ? LIMIT 1`,
    args: [data.id],
  });
  const row = result.rows[0];
  if (!row) throw new Error(`updateFood: food id=${data.id} not found`);

  const food: Food = {
    id: Number(row.id),
    name: String(row.name),
    brand:
      row.brand === null || row.brand === undefined ? null : String(row.brand),
    servingLabel: String(row.serving_label),
    caloriesPerServing: Number(row.calories_per_serving),
    proteinG:
      row.protein_g === null || row.protein_g === undefined
        ? null
        : Number(row.protein_g),
    carbsG:
      row.carbs_g === null || row.carbs_g === undefined
        ? null
        : Number(row.carbs_g),
    fatG:
      row.fat_g === null || row.fat_g === undefined ? null : Number(row.fat_g),
    archived: Number(row.archived) !== 0,
    createdBy:
      row.created_by === null || row.created_by === undefined
        ? null
        : Number(row.created_by),
    createdAt: String(row.created_at),
  };

  revalidateFoodPaths();
  return food;
}

// ---------- archiveFood ----------

const archiveFoodSchema = z.number().int().positive();

export async function archiveFood(id: number): Promise<void> {
  const parsedId = parseOrThrow(archiveFoodSchema, id, 'archiveFood');
  const db = getDb();
  await db.execute({
    sql: 'UPDATE foods SET archived = 1 WHERE id = ?',
    args: [parsedId],
  });
  revalidateFoodPaths();
}

// ---------- addMealItem ----------

const addMealItemSchema = z.object({
  userId: z.number().int().positive(),
  date: dateString,
  foodId: z.number().int().positive(),
  servings: z.number().positive().default(1),
});

export async function addMealItem(input: unknown): Promise<MealItemWithFood> {
  const data = parseOrThrow(addMealItemSchema, input, 'addMealItem');
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO meal_items (user_id, date, food_id, servings)
          VALUES (?, ?, ?, ?)
          RETURNING id`,
    args: [data.userId, data.date, data.foodId, data.servings],
  });
  const row = result.rows[0];
  if (!row) throw new Error('addMealItem: insert did not return a row');
  const newId = Number(row.id);

  const meal = await getMealItemWithFoodById(newId);
  const name = await userNameById(data.userId);
  revalidateMealPaths(name);
  return meal;
}

// ---------- updateMealItemServings ----------

const updateMealItemServingsSchema = z.object({
  id: z.number().int().positive(),
  servings: z.number().positive(),
});

export async function updateMealItemServings(
  id: number,
  servings: number,
): Promise<MealItemWithFood> {
  const data = parseOrThrow(
    updateMealItemServingsSchema,
    { id, servings },
    'updateMealItemServings',
  );
  const db = getDb();
  await db.execute({
    sql: 'UPDATE meal_items SET servings = ? WHERE id = ?',
    args: [data.servings, data.id],
  });

  const meal = await getMealItemWithFoodById(data.id);
  const name = await userNameById(meal.userId);
  revalidateMealPaths(name);
  return meal;
}

// ---------- removeMealItem ----------

const removeMealItemSchema = z.number().int().positive();

export async function removeMealItem(id: number): Promise<void> {
  const parsedId = parseOrThrow(removeMealItemSchema, id, 'removeMealItem');
  const db = getDb();
  // Look up user_id first so we can revalidate the right user's paths.
  const lookup = await db.execute({
    sql: 'SELECT user_id FROM meal_items WHERE id = ? LIMIT 1',
    args: [parsedId],
  });
  const row = lookup.rows[0];
  await db.execute({
    sql: 'DELETE FROM meal_items WHERE id = ?',
    args: [parsedId],
  });
  if (row) {
    const name = await userNameById(Number(row.user_id));
    revalidateMealPaths(name);
  }
}
