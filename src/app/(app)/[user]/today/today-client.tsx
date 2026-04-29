'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Food, MealItemWithFood } from '@/lib/types';
import DailyForm, { type DailyFormInput } from '@/components/DailyForm';
import FoodPicker from '@/components/FoodPicker';
import TodaysMeals from '@/components/TodaysMeals';
import type { FoodFormInput } from '@/components/FoodForm';
import {
  addMealItem,
  createFood,
  removeMealItem,
  updateMealItemServings,
  upsertEntry,
} from '@/server/actions';

export interface TodayClientProps {
  userId: number;
  date: string;
  meals: MealItemWithFood[];
  foods: Food[];
  recentFoods: Food[];
  dailyCalorieTarget: number | null;
  initialWeightLb: number | null;
  initialSteps: number | null;
}

export default function TodayClient({
  userId,
  date,
  meals,
  foods,
  recentFoods,
  dailyCalorieTarget,
  initialWeightLb,
  initialSteps,
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

  async function handleUpdateServings(id: number, servings: number) {
    await updateMealItemServings(id, servings);
    refresh();
  }

  async function handleRemoveMeal(id: number) {
    await removeMealItem(id);
    refresh();
  }

  return (
    <div className="space-y-4">
      <DailyForm
        initialWeightLb={initialWeightLb}
        initialSteps={initialSteps}
        onSave={handleDailySave}
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
        onAdd={handleAddMeal}
        onCreateAndAdd={handleCreateAndAdd}
      />
    </div>
  );
}
