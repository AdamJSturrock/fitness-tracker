'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type {
  Food,
  MealItemWithFood,
  RoutineWithExercises,
  TodayRoutineRow,
  UserName,
  WalkingRoute,
  WalkLogWithRoute,
  WalkPace,
} from '@/lib/types';
import DailyForm, { type DailyFormInput } from '@/components/DailyForm';
import FoodPicker from '@/components/FoodPicker';
import TodaysMeals from '@/components/TodaysMeals';
import WalksSection from '@/components/WalksSection';
import WorkoutSection from '@/components/WorkoutSection';
import type { FoodFormInput } from '@/components/FoodForm';
import {
  addFoodFavorite,
  addMealItem,
  createFood,
  logWalk,
  removeFoodFavorite,
  removeMealItem,
  removeWalkLog,
  tickRoutineExercise,
  untickRoutineExercise,
  updateExerciseLog,
  updateMealItemServings,
  upsertEntry,
} from '@/server/actions';

export interface TodayClientProps {
  userId: number;
  userSegment: UserName;
  date: string;
  meals: MealItemWithFood[];
  foods: Food[];
  recentFoods: Food[];
  favorites: Food[];
  dailyCalorieTarget: number | null;
  initialWeightLb: number | null;
  initialSteps: number | null;
  routine: RoutineWithExercises | null;
  routineRows: TodayRoutineRow[];
  streak: number;
  hasAnyRoutine: boolean;
  walkingRoutes: WalkingRoute[];
  walkLogs: WalkLogWithRoute[];
  latestWeightLb: number | null;
}

export default function TodayClient({
  userId,
  userSegment,
  date,
  meals,
  foods,
  recentFoods,
  favorites,
  dailyCalorieTarget,
  initialWeightLb,
  initialSteps,
  routine,
  routineRows,
  streak,
  hasAnyRoutine,
  walkingRoutes,
  walkLogs,
  latestWeightLb,
}: TodayClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleDailySave(input: DailyFormInput) {
    await upsertEntry({
      userId,
      date,
      ...(input.weightLb !== undefined ? { weightLb: input.weightLb } : {}),
      ...(input.steps !== undefined ? { steps: input.steps } : {}),
    });
    refresh();
  }

  async function handleAddMeal(foodId: number, servings: number) {
    await addMealItem({ userId, date, foodId, servings });
    refresh();
  }

  async function handleCreateAndAdd(input: FoodFormInput) {
    const food = await createFood({ ...input, createdBy: userId });
    await addMealItem({ userId, date, foodId: food.id, servings: 1 });
    refresh();
  }

  const favoriteIdSet = new Set(favorites.map((f) => f.id));

  async function handleToggleFavorite(foodId: number) {
    if (favoriteIdSet.has(foodId)) {
      await removeFoodFavorite({ userId, foodId });
    } else {
      await addFoodFavorite({ userId, foodId });
    }
    refresh();
  }

  async function handleQuickAdd(foodId: number) {
    await addMealItem({ userId, date, foodId, servings: 1 });
    refresh();
  }

  async function handleUpdateServings(id: number, servings: number) {
    await updateMealItemServings(id, servings);
    refresh();
  }

  async function handleRemoveMeal(id: number) {
    await removeMealItem(id);
    refresh();
  }

  async function handleTick(routineExerciseId: number) {
    await tickRoutineExercise({ userId, date, routineExerciseId });
    refresh();
  }
  async function handleUntick(routineExerciseId: number) {
    await untickRoutineExercise({ userId, date, routineExerciseId });
    refresh();
  }
  async function handleUpdateLog(
    logId: number,
    patch: {
      sets?: number | null;
      reps?: number | null;
      weightLb?: number | null;
      durationMin?: number | null;
      distanceMi?: number | null;
      kcalMachine?: number | null;
    },
  ) {
    await updateExerciseLog({ id: logId, ...patch });
    refresh();
  }

  async function handleLogWalk(input: {
    walkingRouteId: number;
    durationMin: number;
    pace: WalkPace;
  }) {
    await logWalk({ userId, date, ...input });
    refresh();
  }

  async function handleRemoveWalk(id: number) {
    await removeWalkLog(id);
    refresh();
  }

  return (
    <div className="space-y-4">
      <DailyForm
        initialWeightLb={initialWeightLb}
        initialSteps={initialSteps}
        onSave={handleDailySave}
      />
      <WorkoutSection
        date={date}
        routine={routine}
        rows={routineRows}
        streak={streak}
        hasAnyRoutine={hasAnyRoutine}
        userSegment={userSegment}
        onTick={handleTick}
        onUntick={handleUntick}
        onUpdateLog={handleUpdateLog}
      />
      <WalksSection
        userId={userId}
        userSegment={userSegment}
        date={date}
        routes={walkingRoutes}
        walkLogs={walkLogs}
        weightLb={latestWeightLb}
        onLog={handleLogWalk}
        onRemove={handleRemoveWalk}
      />
      <TodaysMeals
        meals={meals}
        dailyCalorieTarget={dailyCalorieTarget}
        onUpdateServings={handleUpdateServings}
        onRemove={handleRemoveMeal}
      />
      <FoodPicker
        foods={foods}
        recentFoods={recentFoods}
        favorites={favorites}
        onAdd={handleAddMeal}
        onCreateAndAdd={handleCreateAndAdd}
        onToggleFavorite={handleToggleFavorite}
        onQuickAdd={handleQuickAdd}
        userSegment={userSegment}
      />
    </div>
  );
}
