// Wave 2 mock data — pages import from here while Agent B builds the real
// query layer. Wave 3 will swap fixture imports for real `@/server/queries`
// calls. The shapes here MUST match `@/lib/types`.
//
// Today's reference date is 2026-04-29 (locked at fixture-write time so the
// generated 30-day windows are deterministic for screenshots/tests).

import type {
  DayCalorieTotal,
  Entry,
  Food,
  MealItemWithFood,
  Profile,
  UserName,
} from './types';

const TODAY_REF = '2026-04-29';

// ---------- Profiles ----------

export const mockProfiles: Record<UserName, Profile> = {
  adam: {
    id: 1,
    name: 'adam',
    displayName: 'Adam',
    heightIn: 71,
    age: 35,
    sex: 'm',
    startWeightLb: 200,
    startDate: '2026-03-15',
    targetWeightMinLb: 170,
    targetWeightMaxLb: 175,
    dailyCalorieTarget: 2200,
    dailyStepTarget: 10000,
  },
  anna: {
    id: 2,
    name: 'anna',
    displayName: 'Anna',
    heightIn: 65,
    age: 33,
    sex: 'f',
    startWeightLb: 160,
    startDate: '2026-03-15',
    targetWeightMinLb: 130,
    targetWeightMaxLb: 135,
    dailyCalorieTarget: 1700,
    dailyStepTarget: 10000,
  },
  demo: {
    id: 3,
    name: 'demo',
    displayName: 'Demo',
    heightIn: 70,
    age: 34,
    sex: 'm',
    startWeightLb: 195,
    startDate: '2026-03-01',
    targetWeightMinLb: 165,
    targetWeightMaxLb: 175,
    dailyCalorieTarget: 2000,
    dailyStepTarget: 10000,
  },
};

// ---------- Foods ----------

export const mockFoods: Food[] = [
  {
    id: 1,
    name: 'Weetabix',
    brand: 'Weetabix',
    servingLabel: '2 biscuits',
    caloriesPerServing: 136,
    proteinG: 4.5,
    carbsG: 27,
    fatG: 1,
    archived: false,
    createdBy: 1,
    createdAt: '2026-03-15 08:00:00',
  },
  {
    id: 2,
    name: 'Skimmed milk',
    brand: 'Tesco',
    servingLabel: '100 ml',
    caloriesPerServing: 35,
    proteinG: 3.4,
    carbsG: 5,
    fatG: 0.1,
    archived: false,
    createdBy: 1,
    createdAt: '2026-03-15 08:01:00',
  },
  {
    id: 3,
    name: 'Banana',
    brand: null,
    servingLabel: '1 medium (118 g)',
    caloriesPerServing: 105,
    proteinG: 1.3,
    carbsG: 27,
    fatG: 0.4,
    archived: false,
    createdBy: 2,
    createdAt: '2026-03-16 09:10:00',
  },
  {
    id: 4,
    name: 'Chicken breast',
    brand: null,
    servingLabel: '100 g cooked',
    caloriesPerServing: 165,
    proteinG: 31,
    carbsG: 0,
    fatG: 3.6,
    archived: false,
    createdBy: 1,
    createdAt: '2026-03-15 12:30:00',
  },
  {
    id: 5,
    name: 'Brown rice',
    brand: 'Tilda',
    servingLabel: '125 g cooked',
    caloriesPerServing: 145,
    proteinG: 3,
    carbsG: 30,
    fatG: 1.1,
    archived: false,
    createdBy: 1,
    createdAt: '2026-03-15 12:35:00',
  },
  {
    id: 6,
    name: 'Olive oil',
    brand: 'Filippo Berio',
    servingLabel: '1 tbsp (14 g)',
    caloriesPerServing: 119,
    proteinG: 0,
    carbsG: 0,
    fatG: 13.5,
    archived: false,
    createdBy: 2,
    createdAt: '2026-03-17 18:00:00',
  },
  {
    id: 7,
    name: 'Eggs',
    brand: null,
    servingLabel: '1 large',
    caloriesPerServing: 72,
    proteinG: 6.3,
    carbsG: 0.4,
    fatG: 4.8,
    archived: false,
    createdBy: 2,
    createdAt: '2026-03-15 07:30:00',
  },
  {
    id: 8,
    name: 'Greek yogurt',
    brand: 'Fage 0%',
    servingLabel: '170 g pot',
    caloriesPerServing: 100,
    proteinG: 18,
    carbsG: 6,
    fatG: 0,
    archived: false,
    createdBy: 1,
    createdAt: '2026-03-18 09:00:00',
  },
  {
    id: 9,
    name: 'Almonds',
    brand: null,
    servingLabel: '28 g (~23 nuts)',
    caloriesPerServing: 164,
    proteinG: 6,
    carbsG: 6,
    fatG: 14,
    archived: false,
    createdBy: 1,
    createdAt: '2026-03-19 15:00:00',
  },
  {
    id: 10,
    name: 'Cheddar cheese',
    brand: 'Cathedral City',
    servingLabel: '30 g',
    caloriesPerServing: 124,
    proteinG: 7.5,
    carbsG: 0.1,
    fatG: 10.3,
    archived: false,
    createdBy: 2,
    createdAt: '2026-03-20 19:30:00',
  },
  {
    id: 11,
    name: 'Wholemeal bread',
    brand: 'Hovis',
    servingLabel: '1 slice (38 g)',
    caloriesPerServing: 87,
    proteinG: 4,
    carbsG: 14.6,
    fatG: 1.1,
    archived: false,
    createdBy: 1,
    createdAt: '2026-03-21 07:45:00',
  },
  {
    id: 12,
    name: 'Apple',
    brand: null,
    servingLabel: '1 medium (180 g)',
    caloriesPerServing: 95,
    proteinG: 0.5,
    carbsG: 25,
    fatG: 0.3,
    archived: false,
    createdBy: 2,
    createdAt: '2026-03-22 10:15:00',
  },
];

// ---------- Date helpers (no date-fns to keep this dep-light) ----------

function isoFromOffset(daysAgo: number, ref = TODAY_REF): string {
  const d = new Date(`${ref}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// Deterministic pseudo-random in [-1, 1) seeded by (name, day).
function noise(seed: string, day: number): number {
  let h = 2166136261 ^ day;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Map to [-1, 1)
  const u = ((h >>> 0) % 10000) / 10000;
  return u * 2 - 1;
}

// ---------- Entries ----------

/**
 * 30 days of weight values trending down with ±0.4 lb daily noise.
 * Adam: 200 → 192. Anna: 160 → 156.
 * Steps oscillate around 9k–11k.
 */
export function mockEntries(name: UserName): Entry[] {
  const profile = mockProfiles[name];
  const start = name === 'adam' ? 200 : 160;
  const end = name === 'adam' ? 192 : 156;
  const days = 30;

  const entries: Entry[] = [];
  for (let i = days - 1; i >= 0; i--) {
    // i = days-1 (oldest) ... 0 (today)
    const t = (days - 1 - i) / (days - 1); // 0 at oldest, 1 at today
    const trendWeight = start + (end - start) * t;
    const wNoise = noise(`${name}:w`, i) * 0.4;
    const weightLb = Math.round((trendWeight + wNoise) * 10) / 10;

    const sNoise = noise(`${name}:s`, i) * 1500;
    const baseSteps = name === 'adam' ? 9800 : 9300;
    const steps = Math.max(2000, Math.round(baseSteps + sNoise));

    entries.push({
      userId: profile.id,
      date: isoFromOffset(i),
      weightLb,
      steps,
      notes: null,
    });
  }
  return entries;
}

// ---------- Today's meals ----------

/**
 * 3–5 plausible meal items for the given user/date.
 * Returns `MealItemWithFood[]` — embeds the looked-up food.
 */
export function mockMealsForToday(
  name: UserName,
  date: string,
): MealItemWithFood[] {
  const profile = mockProfiles[name];
  const food = (id: number): Food => {
    const f = mockFoods.find((x) => x.id === id);
    if (!f) throw new Error(`mock food id=${id} missing`);
    return f;
  };

  const baseTime = `${date} `;
  const rows: Array<{ id: number; foodId: number; servings: number; t: string }> =
    name === 'adam'
      ? [
          { id: 1001, foodId: 1, servings: 2, t: '07:30:00' }, // 2× Weetabix
          { id: 1002, foodId: 2, servings: 1.5, t: '07:31:00' }, // 150 ml milk
          { id: 1003, foodId: 12, servings: 1, t: '10:15:00' }, // Apple
          { id: 1004, foodId: 4, servings: 1.5, t: '13:00:00' }, // 150 g chicken
          { id: 1005, foodId: 5, servings: 1, t: '13:01:00' }, // 125 g rice
        ]
      : [
          { id: 2001, foodId: 7, servings: 2, t: '07:45:00' }, // 2 eggs
          { id: 2002, foodId: 11, servings: 2, t: '07:46:00' }, // 2 slices bread
          { id: 2003, foodId: 8, servings: 1, t: '11:00:00' }, // greek yogurt
          { id: 2004, foodId: 9, servings: 1, t: '15:30:00' }, // almonds
        ];

  return rows.map((r) => ({
    id: r.id,
    userId: profile.id,
    date,
    foodId: r.foodId,
    servings: r.servings,
    createdAt: baseTime + r.t,
    food: food(r.foodId),
  }));
}

// ---------- Day calorie totals (for dashboard / projections) ----------

/**
 * 30 days of totals. Wobbles around the user's daily target so charts have
 * something interesting to render. Slightly under-target on average.
 */
export function mockDayCalorieTotals(name: UserName): DayCalorieTotal[] {
  const profile = mockProfiles[name];
  const target = profile.dailyCalorieTarget ?? 2000;
  const totals: DayCalorieTotal[] = [];
  for (let i = 29; i >= 0; i--) {
    const n = noise(`${name}:cal`, i);
    const offset = n * 350 - 80; // mostly slightly under
    const calories = Math.max(800, Math.round(target + offset));
    totals.push({ date: isoFromOffset(i), calories });
  }
  return totals;
}

// ---------- Recently used (for FoodPicker) ----------

/**
 * Top-N recently used foods for a user. Wave 2 mock: just return the first
 * `limit` non-archived foods deterministically per user.
 */
export function mockRecentlyUsedFoods(name: UserName, limit = 8): Food[] {
  const order =
    name === 'adam'
      ? [1, 2, 4, 5, 8, 9, 11, 12, 7, 6]
      : [7, 11, 8, 12, 3, 9, 10, 1, 2, 6];
  const result: Food[] = [];
  for (const id of order) {
    const f = mockFoods.find((x) => x.id === id && !x.archived);
    if (f) result.push(f);
    if (result.length >= limit) break;
  }
  return result;
}

// Today's date constant — page components use this so the whole UI agrees on
// "what is today" until Wave 3 wires real `new Date()`.
export const MOCK_TODAY = TODAY_REF;
