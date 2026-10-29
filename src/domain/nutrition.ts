import { NUTRIENT_UNITS } from './models.ts';
import type { Food, NutrientId, NutrientUnit, ServingUnit } from './models.ts';
import { parseFood } from './validation.ts';

const UNIT_FACTORS: Record<ServingUnit, { family: string; factor: number }> = {
  g: { family: 'mass', factor: 1 },
  kg: { family: 'mass', factor: 1000 },
  oz: { family: 'mass', factor: 28.349523125 },
  ml: { family: 'volume', factor: 1 },
  l: { family: 'volume', factor: 1000 },
  serving: { family: 'serving', factor: 1 },
};

export function convertServingQuantity(quantity: number, from: ServingUnit, to: ServingUnit): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new TypeError('quantity must be a finite non-negative number');
  }
  const fromUnit = UNIT_FACTORS[from];
  const toUnit = UNIT_FACTORS[to];
  if (!fromUnit || !toUnit || fromUnit.family !== toUnit.family) {
    throw new TypeError(`Cannot convert ${from} to ${to}`);
  }
  return (quantity * fromUnit.factor) / toUnit.factor;
}

export interface CalculatedNutrition {
  nutrients: Partial<Record<NutrientId, { quantity: number; unit: NutrientUnit }>>;
  missingNutrients: NutrientId[];
}

export function calculateFoodNutrition(
  input: Food,
  consumedQuantity: number,
  consumedUnit: ServingUnit,
): CalculatedNutrition {
  const food = parseFood(input);
  const quantityInBasis = convertServingQuantity(
    consumedQuantity,
    consumedUnit,
    food.nutritionBasis.unit,
  );
  const multiplier = quantityInBasis / food.nutritionBasis.quantity;
  const nutrients: CalculatedNutrition['nutrients'] = {};
  for (const nutrient of food.nutrients) {
    nutrients[nutrient.nutrient] = {
      quantity: nutrient.quantity * multiplier,
      unit: NUTRIENT_UNITS[nutrient.nutrient],
    };
  }
  const missingNutrients = (Object.keys(NUTRIENT_UNITS) as NutrientId[]).filter(
    (nutrient) => nutrients[nutrient] === undefined,
  );
  return { nutrients, missingNutrients };
}
