'use server';

import type { Entry, Food, MealItem, Profile } from '@/lib/types';

// Wave 1 stubs. Wave 2 Agent B replaces these with Zod-validated server
// actions backed by Turso. Inputs are typed `unknown` for now — Agent B
// defines the proper Zod schemas alongside the implementation.

export async function updateProfile(_input: unknown): Promise<Profile> {
  throw new Error('not implemented');
}

export async function upsertEntry(_input: unknown): Promise<Entry> {
  throw new Error('not implemented');
}

export async function createFood(_input: unknown): Promise<Food> {
  throw new Error('not implemented');
}

export async function updateFood(_input: unknown): Promise<Food> {
  throw new Error('not implemented');
}

export async function archiveFood(_id: number): Promise<void> {
  throw new Error('not implemented');
}

export async function addMealItem(_input: unknown): Promise<MealItem> {
  throw new Error('not implemented');
}

export async function updateMealItemServings(
  _id: number,
  _servings: number,
): Promise<MealItem> {
  throw new Error('not implemented');
}

export async function removeMealItem(_id: number): Promise<void> {
  throw new Error('not implemented');
}
