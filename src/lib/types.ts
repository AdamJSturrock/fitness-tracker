// Wave 1 contract types — Wave 2 agents code against these.
// Field names here are the canonical source of truth across server actions,
// queries, and UI components. Do not deviate.

export type UserName = 'adam' | 'anna' | 'demo';

/** Single source of truth for the valid `[user]` URL segments. */
export const VALID_USERS: readonly UserName[] = ['adam', 'anna', 'demo'];

export type GoalMode = 'loss' | 'build';

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
  /** Optional date the user wants to be inside the target band. */
  targetDate: string | null; // YYYY-MM-DD
  dailyCalorieTarget: number | null;
  dailyStepTarget: number | null;
  /** 'loss' = weight-loss mode (calorie deficit); 'build' = muscle-build mode (surplus). */
  mode: GoalMode;
  /** Optional daily protein target in grams. Mainly relevant in build mode. */
  proteinTargetG: number | null;
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

// ---- Phase 1: workouts ----

export type ExerciseCategory = 'strength' | 'bodyweight' | 'cardio';

export interface Exercise {
  id: number;
  name: string;
  category: ExerciseCategory;
  /**
   * Multiplier applied to user-entered "machine kcal" before display.
   * 1.0 by default; <1 when the machine over-reports (e.g. 0.67 for older
   * elliptical/treadmill consoles). >1 is allowed but unusual.
   */
  kcalCorrectionFactor: number;
  archived: boolean;
  createdAt: string;
}

/** Day numbers are ISO weekday: Mon=1 … Sun=7. */
export interface Routine {
  id: number;
  userId: number;
  name: string;
  scheduleDays: number[];
  archived: boolean;
  createdAt: string;
}

export interface RoutineExercise {
  id: number;
  routineId: number;
  exerciseId: number;
  position: number;
  targetSets: number | null;
  targetReps: number | null;
  targetWeightLb: number | null;
  /** Cardio target: minutes (e.g. 30). */
  targetDurationMin: number | null;
  /** Cardio target: distance in miles (optional, secondary to minutes). */
  targetDistanceMi: number | null;
  notes: string | null;
}

export interface RoutineExerciseWithExercise extends RoutineExercise {
  exercise: Exercise;
}

export interface RoutineWithExercises extends Routine {
  exercises: RoutineExerciseWithExercise[];
}

export interface ExerciseLog {
  id: number;
  userId: number;
  date: string; // YYYY-MM-DD
  exerciseId: number;
  routineId: number | null;
  sets: number | null;
  reps: number | null;
  weightLb: number | null;
  /** Cardio: actual minutes done. */
  durationMin: number | null;
  /** Cardio: actual distance in miles. */
  distanceMi: number | null;
  /** Cardio: machine-reported calories before correction factor. */
  kcalMachine: number | null;
  /** Walks: FK to walking_routes when this log is a dog walk. */
  walkingRouteId: number | null;
  /** Walks: pace tag — 'brisk' | 'normal' | 'stoppy'. */
  walkPace: WalkPace | null;
  notes: string | null;
  createdAt: string;
}

// ---- Phase 4: walking routes ----

export type WalkPace = 'brisk' | 'normal' | 'stoppy';

/**
 * A user-defined walking route, drawn once on the map. Distance and elevation
 * are computed at save time from the GeoJSON LineString polyline and stored so
 * we don't have to re-fetch elevation on every render.
 *
 * `geojson` is a stringified GeoJSON LineString:
 *   `{"type":"LineString","coordinates":[[lng,lat],[lng,lat],...]}`
 */
export interface WalkingRoute {
  id: number;
  userId: number;
  name: string;
  distanceMi: number;
  elevationGainFt: number | null;
  defaultMinutes: number;
  geojson: string;
  archived: boolean;
  createdAt: string;
}

/** A walk log (exercise_log row with walking_route_id set) plus the route. */
export interface WalkLogWithRoute {
  id: number;
  userId: number;
  date: string;
  routeId: number;
  routeName: string;
  durationMin: number;
  pace: WalkPace;
  createdAt: string;
}

export interface ExerciseLogWithExercise extends ExerciseLog {
  exercise: Exercise;
}

/** Today's view of a routine showing target + actual log per exercise. */
export interface TodayRoutineRow {
  routineExercise: RoutineExerciseWithExercise;
  log: ExerciseLog | null;
  /** Most recent prior performance snapshot for this exercise, if any. */
  lastSnapshot: PerformanceSnapshot | null;
}

/**
 * One row per (user, exercise, date) summarising the strength work done that
 * day. Refreshed automatically whenever an exercise_log row is written.
 *
 * `e1rm` is the Epley estimated 1-rep-max: weight × (1 + reps/30).
 * `isPr` is true when this snapshot's e1rm beats every earlier snapshot for
 * the same (user, exercise).
 */
export interface PerformanceSnapshot {
  id: number;
  userId: number;
  exerciseId: number;
  date: string; // YYYY-MM-DD
  topWeightLb: number | null;
  topReps: number | null;
  totalVolumeLb: number | null;
  totalSets: number | null;
  e1rm: number | null;
  isPr: boolean;
  createdAt: string;
}

export interface PerformanceSnapshotWithExercise extends PerformanceSnapshot {
  exercise: Exercise;
}
