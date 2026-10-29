import { NUTRIENT_UNITS } from './models.ts';
import type { Food, FoodLogEntry, Meal, NutrientId, ServingUnit } from './models.ts';
import { calculateFoodNutrition } from './nutrition.ts';
import { parseLocalDate } from './validation.ts';

export interface ManualFoodDraft {
  name: string;
  servingAmount: string;
  servingUnit: ServingUnit;
  consumedAmount: string;
  caloriesKcal: string;
  proteinG: string;
  carbohydrateG: string;
  fatG: string;
  mealId: string;
}

export interface ManualFoodRecord {
  food: Food;
  entry: FoodLogEntry;
}

export interface FoodLogItem {
  entry: FoodLogEntry;
  food: Food;
  meal: Meal;
}

export interface DailyNutritionTotals {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
}

function parseAmount(value: string, label: string, allowZero: boolean): number {
  const trimmed = value.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) {
    throw new TypeError(`${label} must be a plain decimal number`);
  }
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) {
    throw new TypeError(`${label} must be ${allowZero ? 'non-negative' : 'greater than zero'}`);
  }
  return amount;
}

export function createManualFoodRecord(
  draft: ManualFoodDraft,
  loggedDateInput: string,
  now: string,
  foodId: string,
  entryId: string,
): ManualFoodRecord {
  const name = draft.name.trim();
  if (!name) throw new TypeError('Food name is required');
  if (!draft.mealId.trim()) throw new TypeError('Choose a meal');
  const servingAmount = parseAmount(draft.servingAmount, 'Serving amount', false);
  const consumedAmount = parseAmount(draft.consumedAmount, 'Amount eaten', false);
  const loggedDate = parseLocalDate(loggedDateInput, 'Food log date');
  const nutrients = [
    { nutrient: 'energy' as const, quantity: parseAmount(draft.caloriesKcal, 'Calories', true), unit: NUTRIENT_UNITS.energy },
    { nutrient: 'protein' as const, quantity: parseAmount(draft.proteinG, 'Protein', true), unit: NUTRIENT_UNITS.protein },
    { nutrient: 'carbohydrate' as const, quantity: parseAmount(draft.carbohydrateG, 'Carbohydrates', true), unit: NUTRIENT_UNITS.carbohydrate },
    { nutrient: 'fat' as const, quantity: parseAmount(draft.fatG, 'Fat', true), unit: NUTRIENT_UNITS.fat },
  ];

  const food: Food = {
    id: foodId,
    name,
    brand: null,
    servingSize: { quantity: servingAmount, unit: draft.servingUnit },
    nutritionBasis: { quantity: servingAmount, unit: draft.servingUnit },
    nutrients,
    source: 'user_entered',
    sourceDetails: 'Manually entered',
    createdAt: now,
    updatedAt: now,
  };
  const entry: FoodLogEntry = {
    id: entryId,
    foodId,
    mealId: draft.mealId,
    loggedDate,
    consumedQuantity: consumedAmount,
    consumedUnit: draft.servingUnit,
    loggedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  return { food, entry };
}

export function createEmptyDailyNutritionTotals(): DailyNutritionTotals {
  return { caloriesKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0 };
}

export function calculateDailyNutritionTotals(items: readonly FoodLogItem[]): DailyNutritionTotals {
  if (items.length === 0) return createEmptyDailyNutritionTotals();

  const nutrientTotals: Partial<Record<NutrientId, number>> = {};
  for (const item of items) {
    const calculation = calculateFoodNutrition(
      item.food,
      item.entry.consumedQuantity,
      item.entry.consumedUnit as ServingUnit,
    );
    for (const nutrient of ['energy', 'protein', 'carbohydrate', 'fat'] as const) {
      const value = calculation.nutrients[nutrient];
      if (value) {
        nutrientTotals[nutrient] = (nutrientTotals[nutrient] ?? 0) + value.quantity;
      }
    }
  }

  const missingInAnyEntry = (nutrient: NutrientId) =>
    items.some((item) => !item.food.nutrients.some((amount) => amount.nutrient === nutrient));
  const total = (nutrient: NutrientId) =>
    missingInAnyEntry(nutrient) ? null : nutrientTotals[nutrient] ?? null;

  return {
    caloriesKcal: total('energy'),
    proteinG: total('protein'),
    carbohydrateG: total('carbohydrate'),
    fatG: total('fat'),
  };
}

export function getLocalDateString(date: Date = new Date()): string {
  if (!Number.isFinite(date.getTime())) throw new TypeError('date must be valid');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftLocalDate(dateInput: string, dayOffset: number): string {
  const date = parseLocalDate(dateInput);
  if (!Number.isInteger(dayOffset)) throw new TypeError('dayOffset must be an integer');
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(year, month - 1, day + dayOffset);
  return getLocalDateString(shifted);
}

export function formatLocalDate(dateInput: string): string {
  const date = parseLocalDate(dateInput);
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}
