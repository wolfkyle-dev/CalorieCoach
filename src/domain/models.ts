export const NUTRIENT_UNITS = {
  energy: 'kcal',
  protein: 'g',
  carbohydrate: 'g',
  fat: 'g',
  fiber: 'g',
  sodium: 'mg',
} as const;

export type NutrientId = keyof typeof NUTRIENT_UNITS;
export type NutrientUnit = (typeof NUTRIENT_UNITS)[NutrientId];
export type ServingUnit = 'g' | 'kg' | 'oz' | 'ml' | 'l' | 'serving';
export type WeightUnit = 'kg' | 'lb';
export type FoodSource = 'user_entered' | 'verified' | 'estimated';

export interface ServingSize {
  quantity: number;
  unit: ServingUnit;
}

export interface NutrientAmount {
  nutrient: NutrientId;
  quantity: number;
  unit: NutrientUnit;
}

export interface Food {
  id: string;
  name: string;
  brand: string | null;
  servingSize: ServingSize;
  nutritionBasis: ServingSize;
  nutrients: NutrientAmount[];
  source: FoodSource;
  sourceDetails: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Meal {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FoodLogEntry {
  id: string;
  foodId: string;
  mealId: string;
  loggedDate: string;
  consumedQuantity: number;
  consumedUnit: ServingUnit;
  loggedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyGoal {
  id: string;
  effectiveDate: string;
  caloriesKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WeightMeasurement {
  id: string;
  quantity: number;
  unit: WeightUnit;
  measuredAt: string;
  note: string | null;
  createdAt: string;
}

export interface AppSettings {
  id: 'local';
  preferredWeightUnit: WeightUnit;
  createdAt: string;
  updatedAt: string;
}
