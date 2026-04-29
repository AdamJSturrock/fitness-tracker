import 'server-only';
import type { Row } from '@libsql/client';
import { getDb } from '@/lib/db';
import type {
  DayCalorieTotal,
  Entry,
  Exercise,
  ExerciseCategory,
  ExerciseLog,
  ExerciseLogWithExercise,
  Food,
  MealItem,
  MealItemWithFood,
  Profile,
  Routine,
  RoutineExercise,
  RoutineExerciseWithExercise,
  RoutineWithExercises,
  TodayRoutineRow,
  UserName,
} from '@/lib/types';

// Wave 2 Agent B: real Turso-backed read queries.

// ---------- Row -> object mappers ----------

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toIntOrNull(v: unknown): number | null {
  const n = toNumOrNull(v);
  return n === null ? null : Math.trunc(n);
}

function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

function rowToProfile(r: Row): Profile {
  const sex = r.sex === null || r.sex === undefined ? null : String(r.sex);
  return {
    id: Number(r.id),
    name: String(r.name) as UserName,
    displayName: String(r.display_name),
    heightIn: toNumOrNull(r.height_in),
    age: toIntOrNull(r.age),
    sex: sex === 'm' || sex === 'f' ? sex : null,
    startWeightLb: toNumOrNull(r.start_weight_lb),
    startDate: toStringOrNull(r.start_date),
    targetWeightMinLb: toNumOrNull(r.target_weight_min_lb),
    targetWeightMaxLb: toNumOrNull(r.target_weight_max_lb),
    dailyCalorieTarget: toIntOrNull(r.daily_calorie_target),
    dailyStepTarget: toIntOrNull(r.daily_step_target),
  };
}

function rowToEntry(r: Row): Entry {
  return {
    userId: Number(r.user_id),
    date: String(r.date),
    weightLb: toNumOrNull(r.weight_lb),
    steps: toIntOrNull(r.steps),
    notes: toStringOrNull(r.notes),
  };
}

function rowToFood(r: Row): Food {
  return {
    id: Number(r.id),
    name: String(r.name),
    brand: toStringOrNull(r.brand),
    servingLabel: String(r.serving_label),
    caloriesPerServing: Number(r.calories_per_serving),
    proteinG: toNumOrNull(r.protein_g),
    carbsG: toNumOrNull(r.carbs_g),
    fatG: toNumOrNull(r.fat_g),
    archived: Number(r.archived) !== 0,
    createdBy: r.created_by === null || r.created_by === undefined
      ? null
      : Number(r.created_by),
    createdAt: String(r.created_at),
  };
}

function rowToFoodAliased(r: Row, prefix: string): Food {
  return {
    id: Number(r[`${prefix}id`]),
    name: String(r[`${prefix}name`]),
    brand: toStringOrNull(r[`${prefix}brand`]),
    servingLabel: String(r[`${prefix}serving_label`]),
    caloriesPerServing: Number(r[`${prefix}calories_per_serving`]),
    proteinG: toNumOrNull(r[`${prefix}protein_g`]),
    carbsG: toNumOrNull(r[`${prefix}carbs_g`]),
    fatG: toNumOrNull(r[`${prefix}fat_g`]),
    archived: Number(r[`${prefix}archived`]) !== 0,
    createdBy:
      r[`${prefix}created_by`] === null ||
      r[`${prefix}created_by`] === undefined
        ? null
        : Number(r[`${prefix}created_by`]),
    createdAt: String(r[`${prefix}created_at`]),
  };
}

function rowToMealItem(r: Row): MealItem {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    date: String(r.date),
    foodId: Number(r.food_id),
    servings: Number(r.servings),
    createdAt: String(r.created_at),
  };
}

function rowToMealItemWithFood(r: Row): MealItemWithFood {
  // meal_items columns are aliased mi_*, foods columns are f_*.
  return {
    id: Number(r.mi_id),
    userId: Number(r.mi_user_id),
    date: String(r.mi_date),
    foodId: Number(r.mi_food_id),
    servings: Number(r.mi_servings),
    createdAt: String(r.mi_created_at),
    food: rowToFoodAliased(r, 'f_'),
  };
}

const MEAL_JOIN_COLUMNS = `
  meal_items.id            AS mi_id,
  meal_items.user_id       AS mi_user_id,
  meal_items.date          AS mi_date,
  meal_items.food_id       AS mi_food_id,
  meal_items.servings      AS mi_servings,
  meal_items.created_at    AS mi_created_at,
  foods.id                 AS f_id,
  foods.name               AS f_name,
  foods.brand              AS f_brand,
  foods.serving_label      AS f_serving_label,
  foods.calories_per_serving AS f_calories_per_serving,
  foods.protein_g          AS f_protein_g,
  foods.carbs_g            AS f_carbs_g,
  foods.fat_g              AS f_fat_g,
  foods.archived           AS f_archived,
  foods.created_by         AS f_created_by,
  foods.created_at         AS f_created_at
`;

// ---------- Public queries ----------

export async function getProfile(name: UserName): Promise<Profile> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, name, display_name, height_in, age, sex,
                 start_weight_lb, start_date,
                 target_weight_min_lb, target_weight_max_lb,
                 daily_calorie_target, daily_step_target
            FROM users WHERE name = ? LIMIT 1`,
    args: [name],
  });
  const row = result.rows[0];
  if (!row) {
    throw new Error(
      `Profile for user '${name}' not found. Run \`pnpm migrate\` to seed users.`,
    );
  }
  return rowToProfile(row);
}

export async function getEntries(
  userId: number,
  fromDate?: string,
): Promise<Entry[]> {
  const db = getDb();
  if (fromDate) {
    const result = await db.execute({
      sql: `SELECT user_id, date, weight_lb, steps, notes
              FROM entries
             WHERE user_id = ? AND date >= ?
             ORDER BY date ASC`,
      args: [userId, fromDate],
    });
    return result.rows.map(rowToEntry);
  }
  const result = await db.execute({
    sql: `SELECT user_id, date, weight_lb, steps, notes
            FROM entries
           WHERE user_id = ?
           ORDER BY date ASC`,
    args: [userId],
  });
  return result.rows.map(rowToEntry);
}

export async function getMealsForDate(
  userId: number,
  date: string,
): Promise<MealItemWithFood[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT ${MEAL_JOIN_COLUMNS}
            FROM meal_items
            JOIN foods ON foods.id = meal_items.food_id
           WHERE meal_items.user_id = ? AND meal_items.date = ?
           ORDER BY meal_items.created_at ASC, meal_items.id ASC`,
    args: [userId, date],
  });
  return result.rows.map(rowToMealItemWithFood);
}

export async function listFoods(opts?: {
  search?: string;
  includeArchived?: boolean;
}): Promise<Food[]> {
  const db = getDb();
  const search = opts?.search?.trim() ?? '';
  const includeArchived = opts?.includeArchived ?? false;

  const where: string[] = [];
  const args: (string | number)[] = [];
  if (!includeArchived) {
    where.push('archived = 0');
  }
  if (search.length > 0) {
    // Case-insensitive name LIKE %search%. SQLite LIKE is case-insensitive
    // for ASCII by default; force LOWER on both sides for safety.
    where.push('LOWER(name) LIKE ?');
    args.push(`%${search.toLowerCase()}%`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const result = await db.execute({
    sql: `SELECT id, name, brand, serving_label, calories_per_serving,
                 protein_g, carbs_g, fat_g, archived, created_by, created_at
            FROM foods
            ${whereSql}
           ORDER BY name COLLATE NOCASE ASC, id ASC`,
    args,
  });
  return result.rows.map(rowToFood);
}

export async function getRecentlyUsedFoods(
  userId: number,
  limit: number,
): Promise<Food[]> {
  const db = getDb();
  // Foods this user has logged in meal_items in the last 30 days,
  // ranked by usage count (desc), then most-recent log date (desc).
  // Excludes archived foods.
  const result = await db.execute({
    sql: `SELECT foods.id, foods.name, foods.brand, foods.serving_label,
                 foods.calories_per_serving, foods.protein_g, foods.carbs_g,
                 foods.fat_g, foods.archived, foods.created_by, foods.created_at,
                 COUNT(meal_items.id) AS usage_count,
                 MAX(meal_items.date) AS last_date
            FROM meal_items
            JOIN foods ON foods.id = meal_items.food_id
           WHERE meal_items.user_id = ?
             AND meal_items.date >= date('now', '-30 days')
             AND foods.archived = 0
           GROUP BY foods.id
           ORDER BY usage_count DESC, last_date DESC, foods.name COLLATE NOCASE ASC
           LIMIT ?`,
    args: [userId, limit],
  });
  return result.rows.map(rowToFood);
}

export async function getDayCalorieTotals(
  userId: number,
  fromDate?: string,
): Promise<DayCalorieTotal[]> {
  const db = getDb();
  // Note: we include archived foods here — archiving only hides from the
  // picker; calories already eaten still count.
  const args: (string | number)[] = [userId];
  let dateFilter = '';
  if (fromDate) {
    dateFilter = ' AND meal_items.date >= ?';
    args.push(fromDate);
  }
  const result = await db.execute({
    sql: `SELECT meal_items.date AS date,
                 SUM(foods.calories_per_serving * meal_items.servings) AS calories
            FROM meal_items
            JOIN foods ON foods.id = meal_items.food_id
           WHERE meal_items.user_id = ?${dateFilter}
           GROUP BY meal_items.date
           ORDER BY meal_items.date ASC`,
    args,
  });
  return result.rows.map((r) => ({
    date: String(r.date),
    calories: Number(r.calories ?? 0),
  }));
}

// Internal helper: fetch a single MealItemWithFood by id (used by actions).
export async function getMealItemWithFoodById(
  id: number,
): Promise<MealItemWithFood> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT ${MEAL_JOIN_COLUMNS}
            FROM meal_items
            JOIN foods ON foods.id = meal_items.food_id
           WHERE meal_items.id = ?
           LIMIT 1`,
    args: [id],
  });
  const row = result.rows[0];
  if (!row) throw new Error(`MealItem id=${id} not found`);
  return rowToMealItemWithFood(row);
}

// Internal helper used elsewhere if needed.
export { rowToMealItem };

// ---- Phase 1: workouts ----

function parseScheduleDays(raw: unknown): number[] {
  const s = raw === null || raw === undefined ? '' : String(raw);
  if (s.trim() === '') return [];
  return s
    .split(',')
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    .sort((a, b) => a - b);
}

function rowToExercise(r: Row): Exercise {
  const cat = String(r.category);
  const category: ExerciseCategory =
    cat === 'strength' || cat === 'bodyweight' ? cat : 'strength';
  return {
    id: Number(r.id),
    name: String(r.name),
    category,
    archived: Number(r.archived) !== 0,
    createdAt: String(r.created_at),
  };
}

function rowToExerciseAliased(r: Row, prefix: string): Exercise {
  const cat = String(r[`${prefix}category`]);
  const category: ExerciseCategory =
    cat === 'strength' || cat === 'bodyweight' ? cat : 'strength';
  return {
    id: Number(r[`${prefix}id`]),
    name: String(r[`${prefix}name`]),
    category,
    archived: Number(r[`${prefix}archived`]) !== 0,
    createdAt: String(r[`${prefix}created_at`]),
  };
}

function rowToRoutine(r: Row): Routine {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    name: String(r.name),
    scheduleDays: parseScheduleDays(r.schedule_days),
    archived: Number(r.archived) !== 0,
    createdAt: String(r.created_at),
  };
}

function rowToRoutineExercise(r: Row): RoutineExercise {
  return {
    id: Number(r.id),
    routineId: Number(r.routine_id),
    exerciseId: Number(r.exercise_id),
    position: Number(r.position),
    targetSets: toIntOrNull(r.target_sets),
    targetReps: toIntOrNull(r.target_reps),
    targetWeightLb: toNumOrNull(r.target_weight_lb),
    notes: toStringOrNull(r.notes),
  };
}

function rowToExerciseLog(r: Row): ExerciseLog {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    date: String(r.date),
    exerciseId: Number(r.exercise_id),
    routineId:
      r.routine_id === null || r.routine_id === undefined
        ? null
        : Number(r.routine_id),
    sets: toIntOrNull(r.sets),
    reps: toIntOrNull(r.reps),
    weightLb: toNumOrNull(r.weight_lb),
    notes: toStringOrNull(r.notes),
    createdAt: String(r.created_at),
  };
}

const EX_JOIN_COLUMNS = `
  exercises.id         AS ex_id,
  exercises.name       AS ex_name,
  exercises.category   AS ex_category,
  exercises.archived   AS ex_archived,
  exercises.created_at AS ex_created_at
`;

export async function listExercises(opts?: {
  search?: string;
  includeArchived?: boolean;
}): Promise<Exercise[]> {
  const db = getDb();
  const search = opts?.search?.trim() ?? '';
  const includeArchived = opts?.includeArchived ?? false;
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (!includeArchived) where.push('archived = 0');
  if (search.length > 0) {
    where.push('LOWER(name) LIKE ?');
    args.push(`%${search.toLowerCase()}%`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const result = await db.execute({
    sql: `SELECT id, name, category, archived, created_at
            FROM exercises
            ${whereSql}
           ORDER BY name COLLATE NOCASE ASC, id ASC`,
    args,
  });
  return result.rows.map(rowToExercise);
}

export async function listRoutines(
  userId: number,
  opts?: { includeArchived?: boolean },
): Promise<Routine[]> {
  const db = getDb();
  const includeArchived = opts?.includeArchived ?? false;
  const result = await db.execute({
    sql: `SELECT id, user_id, name, schedule_days, archived, created_at
            FROM routines
           WHERE user_id = ?${includeArchived ? '' : ' AND archived = 0'}
           ORDER BY name COLLATE NOCASE ASC, id ASC`,
    args: [userId],
  });
  return result.rows.map(rowToRoutine);
}

export async function getRoutineWithExercises(
  routineId: number,
): Promise<RoutineWithExercises> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT id, user_id, name, schedule_days, archived, created_at
            FROM routines WHERE id = ? LIMIT 1`,
    args: [routineId],
  });
  const head = r.rows[0];
  if (!head) throw new Error(`Routine id=${routineId} not found`);
  const routine = rowToRoutine(head);

  const ex = await db.execute({
    sql: `SELECT routine_exercises.id, routine_exercises.routine_id,
                 routine_exercises.exercise_id, routine_exercises.position,
                 routine_exercises.target_sets, routine_exercises.target_reps,
                 routine_exercises.target_weight_lb, routine_exercises.notes,
                 ${EX_JOIN_COLUMNS}
            FROM routine_exercises
            JOIN exercises ON exercises.id = routine_exercises.exercise_id
           WHERE routine_exercises.routine_id = ?
           ORDER BY routine_exercises.position ASC, routine_exercises.id ASC`,
    args: [routineId],
  });
  const exercises: RoutineExerciseWithExercise[] = ex.rows.map((row) => ({
    ...rowToRoutineExercise(row),
    exercise: rowToExerciseAliased(row, 'ex_'),
  }));
  return { ...routine, exercises };
}

/** ISO weekday: Mon=1 … Sun=7 from a YYYY-MM-DD local date. */
function isoWeekdayFromIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  // Use UTC to avoid TZ surprises; date strings are TZ-agnostic anyway.
  const day = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return day === 0 ? 7 : day; // JS getUTCDay: Sun=0..Sat=6 → ISO Mon=1..Sun=7
}

/**
 * Returns the first non-archived routine scheduled for the date's day-of-week,
 * or null if none. Picks lowest id when multiple match.
 */
export async function getRoutineForDate(
  userId: number,
  date: string,
): Promise<RoutineWithExercises | null> {
  const dow = isoWeekdayFromIso(date);
  const routines = await listRoutines(userId);
  const match = routines.find((r) => r.scheduleDays.includes(dow));
  if (!match) return null;
  return getRoutineWithExercises(match.id);
}

export async function getExerciseLogsForDate(
  userId: number,
  date: string,
): Promise<ExerciseLogWithExercise[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT exercise_logs.id, exercise_logs.user_id, exercise_logs.date,
                 exercise_logs.exercise_id, exercise_logs.routine_id,
                 exercise_logs.sets, exercise_logs.reps, exercise_logs.weight_lb,
                 exercise_logs.notes, exercise_logs.created_at,
                 ${EX_JOIN_COLUMNS}
            FROM exercise_logs
            JOIN exercises ON exercises.id = exercise_logs.exercise_id
           WHERE exercise_logs.user_id = ? AND exercise_logs.date = ?
           ORDER BY exercise_logs.created_at ASC, exercise_logs.id ASC`,
    args: [userId, date],
  });
  return result.rows.map((r) => ({
    ...rowToExerciseLog(r),
    exercise: rowToExerciseAliased(r, 'ex_'),
  }));
}

export async function getTodayRoutineRows(
  userId: number,
  date: string,
): Promise<{
  routine: RoutineWithExercises | null;
  rows: TodayRoutineRow[];
  adHocLogs: ExerciseLogWithExercise[];
}> {
  const routine = await getRoutineForDate(userId, date);
  const allLogs = await getExerciseLogsForDate(userId, date);
  if (!routine) {
    return { routine: null, rows: [], adHocLogs: allLogs };
  }
  const logsByExerciseAndRoutine = new Map<string, ExerciseLog>();
  const usedLogIds = new Set<number>();
  for (const log of allLogs) {
    const key = `${log.exerciseId}::${log.routineId ?? 'null'}`;
    logsByExerciseAndRoutine.set(key, log);
  }
  const rows: TodayRoutineRow[] = routine.exercises.map((re) => {
    const key = `${re.exerciseId}::${routine.id}`;
    const log = logsByExerciseAndRoutine.get(key) ?? null;
    if (log) usedLogIds.add(log.id);
    return { routineExercise: re, log };
  });
  const adHocLogs = allLogs.filter((l) => !usedLogIds.has(l.id));
  return { routine, rows, adHocLogs };
}

/**
 * Streak in scheduled-routine days. Walks back from yesterday and counts
 * consecutive days where:
 *   - that day-of-week has a non-archived scheduled routine for this user, AND
 *   - at least one exercise_log exists for (user, date, routine_id = scheduled
 *     routine id).
 * Days with no scheduled routine are skipped (don't break the streak).
 * Today is NOT included in the count, so an in-progress today doesn't reset it.
 */
export async function getStreak(
  userId: number,
  todayIso: string,
): Promise<number> {
  const routines = await listRoutines(userId);
  if (routines.length === 0) return 0;

  // routine for each ISO weekday (1..7), or null.
  const routineByDow = new Map<number, Routine>();
  for (const r of routines) {
    for (const d of r.scheduleDays) {
      if (!routineByDow.has(d)) routineByDow.set(d, r);
    }
  }
  if (routineByDow.size === 0) return 0;

  const db = getDb();
  // Look back at most 90 scheduled days.
  const HORIZON_DAYS = 365;
  const earliestAllowed = new Date(todayIso + 'T00:00:00Z');
  earliestAllowed.setUTCDate(earliestAllowed.getUTCDate() - HORIZON_DAYS);
  const earliestIso = earliestAllowed.toISOString().slice(0, 10);

  const rows = await db.execute({
    sql: `SELECT date, routine_id
            FROM exercise_logs
           WHERE user_id = ? AND date < ? AND date >= ?
           GROUP BY date, routine_id`,
    args: [userId, todayIso, earliestIso],
  });
  const loggedRoutineIdsByDate = new Map<string, Set<number>>();
  for (const r of rows.rows) {
    const date = String(r.date);
    const rid = r.routine_id === null ? null : Number(r.routine_id);
    if (rid === null) continue;
    const set = loggedRoutineIdsByDate.get(date) ?? new Set<number>();
    set.add(rid);
    loggedRoutineIdsByDate.set(date, set);
  }

  // Walk back day-by-day from yesterday.
  let streak = 0;
  const cursor = new Date(todayIso + 'T00:00:00Z');
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const iso = cursor.toISOString().slice(0, 10);
    const dow = isoWeekdayFromIso(iso);
    const scheduled = routineByDow.get(dow);
    if (!scheduled) {
      // rest day — skip
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      continue;
    }
    const completed =
      loggedRoutineIdsByDate.get(iso)?.has(scheduled.id) ?? false;
    if (!completed) break;
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function getExerciseLogById(
  id: number,
): Promise<ExerciseLogWithExercise> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT exercise_logs.id, exercise_logs.user_id, exercise_logs.date,
                 exercise_logs.exercise_id, exercise_logs.routine_id,
                 exercise_logs.sets, exercise_logs.reps, exercise_logs.weight_lb,
                 exercise_logs.notes, exercise_logs.created_at,
                 ${EX_JOIN_COLUMNS}
            FROM exercise_logs
            JOIN exercises ON exercises.id = exercise_logs.exercise_id
           WHERE exercise_logs.id = ?
           LIMIT 1`,
    args: [id],
  });
  const r = result.rows[0];
  if (!r) throw new Error(`ExerciseLog id=${id} not found`);
  return { ...rowToExerciseLog(r), exercise: rowToExerciseAliased(r, 'ex_') };
}
