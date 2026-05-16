'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import {
  getDogWalkExerciseId,
  getExerciseLogById,
  getMealItemWithFoodById,
  getProfile,
  getWalkingRouteById,
} from '@/server/queries';
import { refreshPerformanceSnapshot as refreshSnapshotShared } from '@/server/snapshots';
import type {
  Entry,
  Exercise,
  ExerciseLog,
  ExerciseLogWithExercise,
  Food,
  MealItemWithFood,
  Profile,
  Routine,
  RoutineExercise,
  UserName,
  WalkingRoute,
} from '@/lib/types';

// ---------- shared schema fragments ----------

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'date must be YYYY-MM-DD',
});

const userNameEnum = z.enum(['adam', 'anna', 'demo']);
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
  // Foods are shared across all users.
  for (const u of ['adam', 'anna', 'demo'] as const) {
    revalidatePath(`/${u}/foods`);
    revalidatePath(`/${u}/today`);
  }
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
  if (name !== 'adam' && name !== 'anna' && name !== 'demo') {
    throw new Error(`Unexpected user name '${name}'`);
  }
  return name;
}

// ---------- updateProfile ----------

const goalModeEnum = z.enum(['loss', 'build']);

const updateProfileSchema = z.object({
  name: userNameEnum,
  heightIn: z.number().positive().nullable().optional(),
  age: z.number().int().positive().nullable().optional(),
  sex: sexEnum.nullable().optional(),
  startWeightLb: z.number().positive().nullable().optional(),
  startDate: dateString.nullable().optional(),
  targetWeightMinLb: z.number().positive().nullable().optional(),
  targetWeightMaxLb: z.number().positive().nullable().optional(),
  targetDate: dateString.nullable().optional(),
  dailyCalorieTarget: z.number().int().positive().nullable().optional(),
  dailyStepTarget: z.number().int().positive().nullable().optional(),
  mode: goalModeEnum.optional(),
  proteinTargetG: z.number().int().positive().nullable().optional(),
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
  if ('targetDate' in data) push('target_date', data.targetDate ?? null);
  if ('dailyCalorieTarget' in data)
    push('daily_calorie_target', data.dailyCalorieTarget ?? null);
  if ('dailyStepTarget' in data)
    push('daily_step_target', data.dailyStepTarget ?? null);
  if ('mode' in data && data.mode !== undefined) push('mode', data.mode);
  if ('proteinTargetG' in data)
    push('protein_target_g', data.proteinTargetG ?? null);

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

// ---------- unarchiveFood ----------

const unarchiveFoodSchema = z.number().int().positive();

export async function unarchiveFood(id: number): Promise<void> {
  const parsedId = parseOrThrow(unarchiveFoodSchema, id, 'unarchiveFood');
  const db = getDb();
  await db.execute({
    sql: 'UPDATE foods SET archived = 0 WHERE id = ?',
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

async function refreshPerformanceSnapshot(
  userId: number,
  exerciseId: number,
  date: string,
): Promise<void> {
  await refreshSnapshotShared(getDb(), userId, exerciseId, date);
}

// ============================================================
// Phase 1: workouts (exercises, routines, exercise_logs)
// ============================================================

const exerciseCategoryEnum = z.enum(['strength', 'bodyweight', 'cardio']);
const scheduleDaysSchema = z
  .array(z.number().int().min(1).max(7))
  .max(7)
  .transform((arr) => Array.from(new Set(arr)).sort((a, b) => a - b));

function revalidateWorkoutPathsForUser(name: UserName) {
  revalidatePath(`/${name}/today`);
  revalidatePath(`/${name}/routines`);
  revalidatePath(`/${name}/dashboard`); // streak shows here
}

function revalidateWalkPathsForUser(name: UserName) {
  revalidatePath(`/${name}/routes`);
  revalidatePath(`/${name}/today`);
}

function revalidateExerciseLibrary() {
  // Exercise library is shared across all users.
  for (const u of ['adam', 'anna', 'demo'] as const) {
    revalidatePath(`/${u}/today`);
    revalidatePath(`/${u}/routines`);
  }
}

// ---------- exercises (shared library) ----------

const createExerciseSchema = z.object({
  name: z.string().min(1),
  category: exerciseCategoryEnum,
  kcalCorrectionFactor: z.number().positive().max(2).optional(),
});

export async function createExercise(input: unknown): Promise<Exercise> {
  const data = parseOrThrow(createExerciseSchema, input, 'createExercise');
  // Default elliptical/cardio to 0.67 if not specified, since modern exercise
  // physiology research suggests older cardio machines over-report by ~30%.
  // Strength/bodyweight default to 1.0 (no correction).
  const factor =
    data.kcalCorrectionFactor ?? (data.category === 'cardio' ? 0.67 : 1);
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO exercises (name, category, kcal_correction_factor)
          VALUES (?, ?, ?)
          RETURNING id, name, category, kcal_correction_factor, archived, created_at`,
    args: [data.name, data.category, factor],
  });
  const row = result.rows[0];
  if (!row) throw new Error('createExercise: insert did not return a row');
  const ex: Exercise = {
    id: Number(row.id),
    name: String(row.name),
    category: data.category,
    kcalCorrectionFactor: Number(row.kcal_correction_factor),
    archived: Number(row.archived) !== 0,
    createdAt: String(row.created_at),
  };
  revalidateExerciseLibrary();
  return ex;
}

const updateExerciseSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).optional(),
  category: exerciseCategoryEnum.optional(),
  kcalCorrectionFactor: z.number().positive().max(2).optional(),
});

export async function updateExercise(input: unknown): Promise<Exercise> {
  const data = parseOrThrow(updateExerciseSchema, input, 'updateExercise');
  const db = getDb();
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (data.name !== undefined) {
    sets.push('name = ?');
    args.push(data.name);
  }
  if (data.category !== undefined) {
    sets.push('category = ?');
    args.push(data.category);
  }
  if (data.kcalCorrectionFactor !== undefined) {
    sets.push('kcal_correction_factor = ?');
    args.push(data.kcalCorrectionFactor);
  }
  if (sets.length > 0) {
    args.push(data.id);
    await db.execute({
      sql: `UPDATE exercises SET ${sets.join(', ')} WHERE id = ?`,
      args,
    });
  }
  const r = await db.execute({
    sql: 'SELECT id, name, category, kcal_correction_factor, archived, created_at FROM exercises WHERE id = ?',
    args: [data.id],
  });
  const row = r.rows[0];
  if (!row) throw new Error(`updateExercise: id=${data.id} not found`);
  const catRaw = String(row.category);
  const category =
    catRaw === 'bodyweight' || catRaw === 'cardio' ? catRaw : 'strength';
  const ex: Exercise = {
    id: Number(row.id),
    name: String(row.name),
    category,
    kcalCorrectionFactor:
      row.kcal_correction_factor === null ||
      row.kcal_correction_factor === undefined
        ? 1
        : Number(row.kcal_correction_factor),
    archived: Number(row.archived) !== 0,
    createdAt: String(row.created_at),
  };
  revalidateExerciseLibrary();
  return ex;
}

export async function archiveExercise(id: number): Promise<void> {
  const parsed = parseOrThrow(z.number().int().positive(), id, 'archiveExercise');
  const db = getDb();
  await db.execute({
    sql: 'UPDATE exercises SET archived = 1 WHERE id = ?',
    args: [parsed],
  });
  revalidateExerciseLibrary();
}

export async function unarchiveExercise(id: number): Promise<void> {
  const parsed = parseOrThrow(
    z.number().int().positive(),
    id,
    'unarchiveExercise',
  );
  const db = getDb();
  await db.execute({
    sql: 'UPDATE exercises SET archived = 0 WHERE id = ?',
    args: [parsed],
  });
  revalidateExerciseLibrary();
}

// ---------- routines (per user) ----------

const createRoutineSchema = z.object({
  userId: z.number().int().positive(),
  name: z.string().min(1),
  scheduleDays: scheduleDaysSchema,
});

export async function createRoutine(input: unknown): Promise<Routine> {
  const data = parseOrThrow(createRoutineSchema, input, 'createRoutine');
  const db = getDb();
  const days = data.scheduleDays.join(',');
  const result = await db.execute({
    sql: `INSERT INTO routines (user_id, name, schedule_days)
          VALUES (?, ?, ?)
          RETURNING id, user_id, name, schedule_days, archived, created_at`,
    args: [data.userId, data.name, days],
  });
  const row = result.rows[0];
  if (!row) throw new Error('createRoutine: insert did not return a row');
  const routine: Routine = {
    id: Number(row.id),
    userId: Number(row.user_id),
    name: String(row.name),
    scheduleDays: data.scheduleDays,
    archived: Number(row.archived) !== 0,
    createdAt: String(row.created_at),
  };
  const name = await userNameById(data.userId);
  revalidateWorkoutPathsForUser(name);
  return routine;
}

const updateRoutineSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).optional(),
  scheduleDays: scheduleDaysSchema.optional(),
});

export async function updateRoutine(input: unknown): Promise<Routine> {
  const data = parseOrThrow(updateRoutineSchema, input, 'updateRoutine');
  const db = getDb();
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (data.name !== undefined) {
    sets.push('name = ?');
    args.push(data.name);
  }
  if (data.scheduleDays !== undefined) {
    sets.push('schedule_days = ?');
    args.push(data.scheduleDays.join(','));
  }
  if (sets.length > 0) {
    args.push(data.id);
    await db.execute({
      sql: `UPDATE routines SET ${sets.join(', ')} WHERE id = ?`,
      args,
    });
  }
  const r = await db.execute({
    sql: `SELECT id, user_id, name, schedule_days, archived, created_at
            FROM routines WHERE id = ?`,
    args: [data.id],
  });
  const row = r.rows[0];
  if (!row) throw new Error(`updateRoutine: id=${data.id} not found`);
  const days = String(row.schedule_days ?? '')
    .split(',')
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  const routine: Routine = {
    id: Number(row.id),
    userId: Number(row.user_id),
    name: String(row.name),
    scheduleDays: days,
    archived: Number(row.archived) !== 0,
    createdAt: String(row.created_at),
  };
  const name = await userNameById(routine.userId);
  revalidateWorkoutPathsForUser(name);
  return routine;
}

export async function archiveRoutine(id: number): Promise<void> {
  const parsed = parseOrThrow(z.number().int().positive(), id, 'archiveRoutine');
  const db = getDb();
  const lookup = await db.execute({
    sql: 'SELECT user_id FROM routines WHERE id = ? LIMIT 1',
    args: [parsed],
  });
  await db.execute({
    sql: 'UPDATE routines SET archived = 1 WHERE id = ?',
    args: [parsed],
  });
  if (lookup.rows[0]) {
    const name = await userNameById(Number(lookup.rows[0].user_id));
    revalidateWorkoutPathsForUser(name);
  }
}

export async function unarchiveRoutine(id: number): Promise<void> {
  const parsed = parseOrThrow(
    z.number().int().positive(),
    id,
    'unarchiveRoutine',
  );
  const db = getDb();
  const lookup = await db.execute({
    sql: 'SELECT user_id FROM routines WHERE id = ? LIMIT 1',
    args: [parsed],
  });
  await db.execute({
    sql: 'UPDATE routines SET archived = 0 WHERE id = ?',
    args: [parsed],
  });
  if (lookup.rows[0]) {
    const name = await userNameById(Number(lookup.rows[0].user_id));
    revalidateWorkoutPathsForUser(name);
  }
}

// ---------- routine_exercises ----------

const addExerciseToRoutineSchema = z.object({
  routineId: z.number().int().positive(),
  exerciseId: z.number().int().positive(),
  targetSets: z.number().int().positive().nullable().optional(),
  targetReps: z.number().int().positive().nullable().optional(),
  targetWeightLb: z.number().positive().nullable().optional(),
  targetDurationMin: z.number().positive().nullable().optional(),
  targetDistanceMi: z.number().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

async function userIdForRoutine(routineId: number): Promise<number> {
  const db = getDb();
  const r = await db.execute({
    sql: 'SELECT user_id FROM routines WHERE id = ? LIMIT 1',
    args: [routineId],
  });
  const row = r.rows[0];
  if (!row) throw new Error(`Routine id=${routineId} not found`);
  return Number(row.user_id);
}

export async function addExerciseToRoutine(
  input: unknown,
): Promise<RoutineExercise> {
  const data = parseOrThrow(
    addExerciseToRoutineSchema,
    input,
    'addExerciseToRoutine',
  );
  const db = getDb();
  // Auto-position: max(position) + 1 within this routine.
  const posR = await db.execute({
    sql: 'SELECT COALESCE(MAX(position), 0) + 1 AS next FROM routine_exercises WHERE routine_id = ?',
    args: [data.routineId],
  });
  const position = Number(posR.rows[0]?.next ?? 1);
  const result = await db.execute({
    sql: `INSERT INTO routine_exercises
            (routine_id, exercise_id, position,
             target_sets, target_reps, target_weight_lb,
             target_duration_min, target_distance_mi, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id, routine_id, exercise_id, position,
                    target_sets, target_reps, target_weight_lb,
                    target_duration_min, target_distance_mi, notes`,
    args: [
      data.routineId,
      data.exerciseId,
      position,
      data.targetSets ?? null,
      data.targetReps ?? null,
      data.targetWeightLb ?? null,
      data.targetDurationMin ?? null,
      data.targetDistanceMi ?? null,
      data.notes ?? null,
    ],
  });
  const row = result.rows[0];
  if (!row) throw new Error('addExerciseToRoutine: insert did not return');
  const re: RoutineExercise = {
    id: Number(row.id),
    routineId: Number(row.routine_id),
    exerciseId: Number(row.exercise_id),
    position: Number(row.position),
    targetSets:
      row.target_sets === null || row.target_sets === undefined
        ? null
        : Number(row.target_sets),
    targetReps:
      row.target_reps === null || row.target_reps === undefined
        ? null
        : Number(row.target_reps),
    targetWeightLb:
      row.target_weight_lb === null || row.target_weight_lb === undefined
        ? null
        : Number(row.target_weight_lb),
    targetDurationMin:
      row.target_duration_min === null || row.target_duration_min === undefined
        ? null
        : Number(row.target_duration_min),
    targetDistanceMi:
      row.target_distance_mi === null || row.target_distance_mi === undefined
        ? null
        : Number(row.target_distance_mi),
    notes:
      row.notes === null || row.notes === undefined ? null : String(row.notes),
  };
  const userId = await userIdForRoutine(data.routineId);
  const name = await userNameById(userId);
  revalidateWorkoutPathsForUser(name);
  return re;
}

const updateRoutineExerciseSchema = z.object({
  id: z.number().int().positive(),
  position: z.number().int().nonnegative().optional(),
  targetSets: z.number().int().positive().nullable().optional(),
  targetReps: z.number().int().positive().nullable().optional(),
  targetWeightLb: z.number().positive().nullable().optional(),
  targetDurationMin: z.number().positive().nullable().optional(),
  targetDistanceMi: z.number().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function updateRoutineExercise(
  input: unknown,
): Promise<RoutineExercise> {
  const data = parseOrThrow(
    updateRoutineExerciseSchema,
    input,
    'updateRoutineExercise',
  );
  const db = getDb();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const push = (col: string, value: unknown) => {
    sets.push(`${col} = ?`);
    args.push(value as string | number | null);
  };
  if (data.position !== undefined) push('position', data.position);
  if ('targetSets' in data) push('target_sets', data.targetSets ?? null);
  if ('targetReps' in data) push('target_reps', data.targetReps ?? null);
  if ('targetWeightLb' in data)
    push('target_weight_lb', data.targetWeightLb ?? null);
  if ('targetDurationMin' in data)
    push('target_duration_min', data.targetDurationMin ?? null);
  if ('targetDistanceMi' in data)
    push('target_distance_mi', data.targetDistanceMi ?? null);
  if ('notes' in data) push('notes', data.notes ?? null);
  if (sets.length > 0) {
    args.push(data.id);
    await db.execute({
      sql: `UPDATE routine_exercises SET ${sets.join(', ')} WHERE id = ?`,
      args,
    });
  }
  const r = await db.execute({
    sql: `SELECT id, routine_id, exercise_id, position,
                 target_sets, target_reps, target_weight_lb,
                 target_duration_min, target_distance_mi, notes
            FROM routine_exercises WHERE id = ?`,
    args: [data.id],
  });
  const row = r.rows[0];
  if (!row) throw new Error(`updateRoutineExercise: id=${data.id} not found`);
  const re: RoutineExercise = {
    id: Number(row.id),
    routineId: Number(row.routine_id),
    exerciseId: Number(row.exercise_id),
    position: Number(row.position),
    targetSets:
      row.target_sets === null || row.target_sets === undefined
        ? null
        : Number(row.target_sets),
    targetReps:
      row.target_reps === null || row.target_reps === undefined
        ? null
        : Number(row.target_reps),
    targetWeightLb:
      row.target_weight_lb === null || row.target_weight_lb === undefined
        ? null
        : Number(row.target_weight_lb),
    targetDurationMin:
      row.target_duration_min === null || row.target_duration_min === undefined
        ? null
        : Number(row.target_duration_min),
    targetDistanceMi:
      row.target_distance_mi === null || row.target_distance_mi === undefined
        ? null
        : Number(row.target_distance_mi),
    notes:
      row.notes === null || row.notes === undefined ? null : String(row.notes),
  };
  const userId = await userIdForRoutine(re.routineId);
  const name = await userNameById(userId);
  revalidateWorkoutPathsForUser(name);
  return re;
}

export async function removeRoutineExercise(id: number): Promise<void> {
  const parsed = parseOrThrow(
    z.number().int().positive(),
    id,
    'removeRoutineExercise',
  );
  const db = getDb();
  const lookup = await db.execute({
    sql: 'SELECT routine_id FROM routine_exercises WHERE id = ?',
    args: [parsed],
  });
  await db.execute({
    sql: 'DELETE FROM routine_exercises WHERE id = ?',
    args: [parsed],
  });
  if (lookup.rows[0]) {
    const userId = await userIdForRoutine(Number(lookup.rows[0].routine_id));
    const name = await userNameById(userId);
    revalidateWorkoutPathsForUser(name);
  }
}

// ---------- exercise_logs (tick-off + ad-hoc) ----------

const tickRoutineExerciseSchema = z.object({
  userId: z.number().int().positive(),
  date: dateString,
  routineExerciseId: z.number().int().positive(),
});

export async function tickRoutineExercise(
  input: unknown,
): Promise<ExerciseLogWithExercise> {
  const data = parseOrThrow(
    tickRoutineExerciseSchema,
    input,
    'tickRoutineExercise',
  );
  const db = getDb();
  const reR = await db.execute({
    sql: `SELECT routine_id, exercise_id,
                 target_sets, target_reps, target_weight_lb,
                 target_duration_min, target_distance_mi
            FROM routine_exercises WHERE id = ? LIMIT 1`,
    args: [data.routineExerciseId],
  });
  const re = reR.rows[0];
  if (!re) {
    throw new Error(
      `tickRoutineExercise: routine_exercise id=${data.routineExerciseId} not found`,
    );
  }
  const routineId = Number(re.routine_id);
  const exerciseId = Number(re.exercise_id);

  // Idempotent: if already logged for (user, date, exercise, routine), reuse it.
  const existing = await db.execute({
    sql: `SELECT id FROM exercise_logs
           WHERE user_id = ? AND date = ?
             AND exercise_id = ? AND routine_id = ?
           LIMIT 1`,
    args: [data.userId, data.date, exerciseId, routineId],
  });
  let logId: number;
  if (existing.rows[0]) {
    logId = Number(existing.rows[0].id);
  } else {
    const ins = await db.execute({
      sql: `INSERT INTO exercise_logs
              (user_id, date, exercise_id, routine_id,
               sets, reps, weight_lb,
               duration_min, distance_mi)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id`,
      args: [
        data.userId,
        data.date,
        exerciseId,
        routineId,
        re.target_sets ?? null,
        re.target_reps ?? null,
        re.target_weight_lb ?? null,
        re.target_duration_min ?? null,
        re.target_distance_mi ?? null,
      ],
    });
    logId = Number(ins.rows[0].id);
  }
  await refreshPerformanceSnapshot(data.userId, exerciseId, data.date);
  const log = await getExerciseLogById(logId);
  const name = await userNameById(data.userId);
  revalidateWorkoutPathsForUser(name);
  return log;
}

const untickRoutineExerciseSchema = z.object({
  userId: z.number().int().positive(),
  date: dateString,
  routineExerciseId: z.number().int().positive(),
});

export async function untickRoutineExercise(input: unknown): Promise<void> {
  const data = parseOrThrow(
    untickRoutineExerciseSchema,
    input,
    'untickRoutineExercise',
  );
  const db = getDb();
  const reR = await db.execute({
    sql: 'SELECT routine_id, exercise_id FROM routine_exercises WHERE id = ?',
    args: [data.routineExerciseId],
  });
  const re = reR.rows[0];
  if (!re) return;
  await db.execute({
    sql: `DELETE FROM exercise_logs
           WHERE user_id = ? AND date = ?
             AND exercise_id = ? AND routine_id = ?`,
    args: [data.userId, data.date, Number(re.exercise_id), Number(re.routine_id)],
  });
  await refreshPerformanceSnapshot(
    data.userId,
    Number(re.exercise_id),
    data.date,
  );
  const name = await userNameById(data.userId);
  revalidateWorkoutPathsForUser(name);
}

const updateExerciseLogSchema = z.object({
  id: z.number().int().positive(),
  sets: z.number().int().positive().nullable().optional(),
  reps: z.number().int().positive().nullable().optional(),
  weightLb: z.number().positive().nullable().optional(),
  durationMin: z.number().positive().nullable().optional(),
  distanceMi: z.number().positive().nullable().optional(),
  kcalMachine: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function updateExerciseLog(
  input: unknown,
): Promise<ExerciseLog> {
  const data = parseOrThrow(updateExerciseLogSchema, input, 'updateExerciseLog');
  const db = getDb();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const push = (col: string, value: unknown) => {
    sets.push(`${col} = ?`);
    args.push(value as string | number | null);
  };
  if ('sets' in data) push('sets', data.sets ?? null);
  if ('reps' in data) push('reps', data.reps ?? null);
  if ('weightLb' in data) push('weight_lb', data.weightLb ?? null);
  if ('durationMin' in data) push('duration_min', data.durationMin ?? null);
  if ('distanceMi' in data) push('distance_mi', data.distanceMi ?? null);
  if ('kcalMachine' in data) push('kcal_machine', data.kcalMachine ?? null);
  if ('notes' in data) push('notes', data.notes ?? null);
  if (sets.length > 0) {
    args.push(data.id);
    await db.execute({
      sql: `UPDATE exercise_logs SET ${sets.join(', ')} WHERE id = ?`,
      args,
    });
  }
  const log = await getExerciseLogById(data.id);
  await refreshPerformanceSnapshot(log.userId, log.exerciseId, log.date);
  const name = await userNameById(log.userId);
  revalidateWorkoutPathsForUser(name);
  return log;
}

const logExerciseSchema = z.object({
  userId: z.number().int().positive(),
  date: dateString,
  exerciseId: z.number().int().positive(),
  sets: z.number().int().positive().nullable().optional(),
  reps: z.number().int().positive().nullable().optional(),
  weightLb: z.number().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function logExercise(
  input: unknown,
): Promise<ExerciseLogWithExercise> {
  const data = parseOrThrow(logExerciseSchema, input, 'logExercise');
  const db = getDb();
  const ins = await db.execute({
    sql: `INSERT INTO exercise_logs
            (user_id, date, exercise_id, routine_id,
             sets, reps, weight_lb, notes)
          VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
          RETURNING id`,
    args: [
      data.userId,
      data.date,
      data.exerciseId,
      data.sets ?? null,
      data.reps ?? null,
      data.weightLb ?? null,
      data.notes ?? null,
    ],
  });
  const log = await getExerciseLogById(Number(ins.rows[0].id));
  await refreshPerformanceSnapshot(data.userId, data.exerciseId, data.date);
  const name = await userNameById(data.userId);
  revalidateWorkoutPathsForUser(name);
  return log;
}

export async function removeExerciseLog(id: number): Promise<void> {
  const parsed = parseOrThrow(
    z.number().int().positive(),
    id,
    'removeExerciseLog',
  );
  const db = getDb();
  const lookup = await db.execute({
    sql: 'SELECT user_id, exercise_id, date FROM exercise_logs WHERE id = ?',
    args: [parsed],
  });
  await db.execute({
    sql: 'DELETE FROM exercise_logs WHERE id = ?',
    args: [parsed],
  });
  if (lookup.rows[0]) {
    const userId = Number(lookup.rows[0].user_id);
    const exerciseId = Number(lookup.rows[0].exercise_id);
    const date = String(lookup.rows[0].date);
    await refreshPerformanceSnapshot(userId, exerciseId, date);
    const name = await userNameById(userId);
    revalidateWorkoutPathsForUser(name);
  }
}

// ============================================================
// Phase 4: walking routes
// ============================================================

const walkPaceEnum = z.enum(['brisk', 'normal', 'stoppy']);

const createWalkingRouteSchema = z.object({
  userId: z.number().int().positive(),
  name: z
    .string()
    .trim()
    .min(1, { message: 'name must not be empty' })
    .max(100),
  distanceMi: z.number().positive(),
  elevationGainFt: z.number().nullable().optional(),
  defaultMinutes: z.number().int().positive(),
  geojson: z.string().min(1),
});

export async function createWalkingRoute(
  input: unknown,
): Promise<WalkingRoute> {
  const data = parseOrThrow(
    createWalkingRouteSchema,
    input,
    'createWalkingRoute',
  );
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO walking_routes
            (user_id, name, distance_mi, elevation_gain_ft,
             default_minutes, geojson)
          VALUES (?, ?, ?, ?, ?, ?)
          RETURNING id`,
    args: [
      data.userId,
      data.name,
      data.distanceMi,
      data.elevationGainFt ?? null,
      data.defaultMinutes,
      data.geojson,
    ],
  });
  const row = result.rows[0];
  if (!row) throw new Error('createWalkingRoute: insert did not return a row');
  const route = await getWalkingRouteById(Number(row.id));
  const name = await userNameById(data.userId);
  revalidateWalkPathsForUser(name);
  return route;
}

const updateWalkingRouteSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(100).optional(),
  defaultMinutes: z.number().int().positive().optional(),
});

export async function updateWalkingRoute(
  input: unknown,
): Promise<WalkingRoute> {
  const data = parseOrThrow(
    updateWalkingRouteSchema,
    input,
    'updateWalkingRoute',
  );
  const db = getDb();
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (data.name !== undefined) {
    sets.push('name = ?');
    args.push(data.name);
  }
  if (data.defaultMinutes !== undefined) {
    sets.push('default_minutes = ?');
    args.push(data.defaultMinutes);
  }
  if (sets.length > 0) {
    args.push(data.id);
    await db.execute({
      sql: `UPDATE walking_routes SET ${sets.join(', ')} WHERE id = ?`,
      args,
    });
  }
  const route = await getWalkingRouteById(data.id);
  const name = await userNameById(route.userId);
  revalidateWalkPathsForUser(name);
  return route;
}

export async function archiveWalkingRoute(id: number): Promise<void> {
  const parsed = parseOrThrow(
    z.number().int().positive(),
    id,
    'archiveWalkingRoute',
  );
  const db = getDb();
  const lookup = await db.execute({
    sql: 'SELECT user_id FROM walking_routes WHERE id = ? LIMIT 1',
    args: [parsed],
  });
  await db.execute({
    sql: 'UPDATE walking_routes SET archived = 1 WHERE id = ?',
    args: [parsed],
  });
  if (lookup.rows[0]) {
    const name = await userNameById(Number(lookup.rows[0].user_id));
    revalidateWalkPathsForUser(name);
  }
}

const logWalkSchema = z.object({
  userId: z.number().int().positive(),
  date: dateString,
  walkingRouteId: z.number().int().positive(),
  durationMin: z.number().positive(),
  pace: walkPaceEnum,
});

export async function logWalk(input: unknown): Promise<void> {
  const data = parseOrThrow(logWalkSchema, input, 'logWalk');
  const route = await getWalkingRouteById(data.walkingRouteId);
  if (route.userId !== data.userId) {
    throw new Error(
      `logWalk: route id=${data.walkingRouteId} does not belong to user id=${data.userId}`,
    );
  }
  const exerciseId = await getDogWalkExerciseId();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO exercise_logs
            (user_id, date, exercise_id, routine_id,
             duration_min, distance_mi,
             walking_route_id, walk_pace)
          VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    args: [
      data.userId,
      data.date,
      exerciseId,
      data.durationMin,
      route.distanceMi,
      route.id,
      data.pace,
    ],
  });
  const name = await userNameById(data.userId);
  revalidatePath(`/${name}/today`);
}

export async function removeWalkLog(id: number): Promise<void> {
  const parsed = parseOrThrow(
    z.number().int().positive(),
    id,
    'removeWalkLog',
  );
  const db = getDb();
  const lookup = await db.execute({
    sql: 'SELECT user_id, walking_route_id FROM exercise_logs WHERE id = ? LIMIT 1',
    args: [parsed],
  });
  const row = lookup.rows[0];
  if (!row) throw new Error(`removeWalkLog: exercise_log id=${parsed} not found`);
  if (row.walking_route_id === null || row.walking_route_id === undefined) {
    throw new Error(
      `removeWalkLog: exercise_log id=${parsed} is not a walk (walking_route_id is null)`,
    );
  }
  await db.execute({
    sql: 'DELETE FROM exercise_logs WHERE id = ?',
    args: [parsed],
  });
  const name = await userNameById(Number(row.user_id));
  revalidatePath(`/${name}/today`);
}

