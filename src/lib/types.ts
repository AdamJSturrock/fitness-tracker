// Wave 1 contract types — Wave 2 agents code against these.
// Field names here are the canonical source of truth across server actions,
// queries, and UI components. Do not deviate.

export type UserName = 'adam' | 'anna' | 'demo';

/** Single source of truth for the valid `[user]` URL segments. */
export const VALID_USERS: readonly UserName[] = ['adam', 'anna', 'demo'];

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
  notes: string | null;
  createdAt: string;
}

export interface ExerciseLogWithExercise extends ExerciseLog {
  exercise: Exercise;
}

/** Today's view of a routine showing target + actual log per exercise. */
export interface TodayRoutineRow {
  routineExercise: RoutineExerciseWithExercise;
  log: ExerciseLog | null;
}
