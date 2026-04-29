'use client';

import { useState } from 'react';
import type { Food, MealItemWithFood } from '@/lib/types';
import DailyForm, { type DailyFormInput } from '@/components/DailyForm';
import FoodPicker from '@/components/FoodPicker';
import TodaysMeals from '@/components/TodaysMeals';
import type { FoodFormInput } from '@/components/FoodForm';

export interface TodayClientProps {
  meals: MealItemWithFood[];
  foods: Food[];
  recentFoods: Food[];
  dailyCalorieTarget: number | null;
  initialWeightLb: number | null;
  initialSteps: number | null;
}

/**
 * Wave 2 wires the page together with mock no-op handlers. The handler
 * shapes match the Wave 3 server actions in `@/server/actions` so swapping
 * is a one-line import change per page.
 */
export default function TodayClient({
  meals: initialMeals,
  foods: initialFoods,
  recentFoods,
  dailyCalorieTarget,
  initialWeightLb,
  initialSteps,
}: TodayClientProps) {
  // Local state so the UI feels live in Wave 2 (Wave 3 will swap to
  // revalidation-driven server data).
  const [meals, setMeals] = useState(initialMeals);
  const [foods, setFoods] = useState(initialFoods);

  function nextId(): number {
    return Math.max(0, ...meals.map((m) => m.id), ...foods.map((f) => f.id)) + 1;
  }

  async function handleDailySave(input: DailyFormInput) {
    // eslint-disable-next-line no-console
    console.log('mock save daily', input);
  }

  async function handleAddMeal(foodId: number, servings: number) {
    const food = foods.find((f) => f.id === foodId);
    if (!food) return;
    const id = nextId();
    setMeals((prev) => [
      ...prev,
      {
        id,
        userId: 0,
        date: '',
        foodId: food.id,
        servings,
        createdAt: new Date().toISOString(),
        food,
      },
    ]);
    // eslint-disable-next-line no-console
    console.log('mock addMealItem', { foodId, servings });
  }

  async function handleCreateAndAdd(input: FoodFormInput) {
    const id = nextId();
    const newFood: Food = {
      id,
      name: input.name,
      brand: input.brand,
      servingLabel: input.servingLabel,
      caloriesPerServing: input.caloriesPerServing,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
      archived: false,
      createdBy: null,
      createdAt: new Date().toISOString(),
    };
    setFoods((prev) => [...prev, newFood]);
    setMeals((prev) => [
      ...prev,
      {
        id: id + 1,
        userId: 0,
        date: '',
        foodId: newFood.id,
        servings: 1,
        createdAt: new Date().toISOString(),
        food: newFood,
      },
    ]);
    // eslint-disable-next-line no-console
    console.log('mock createFood + addMealItem', input);
  }

  async function handleUpdateServings(id: number, servings: number) {
    setMeals((prev) =>
      prev.map((m) => (m.id === id ? { ...m, servings } : m)),
    );
    // eslint-disable-next-line no-console
    console.log('mock updateMealItemServings', { id, servings });
  }

  async function handleRemoveMeal(id: number) {
    setMeals((prev) => prev.filter((m) => m.id !== id));
    // eslint-disable-next-line no-console
    console.log('mock removeMealItem', { id });
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
