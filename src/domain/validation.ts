import { NUTRIENT_UNITS } from './models.ts';
import type {
  AppSettings,
  DailyGoal,
  Food,
  FoodLogEntry,
  FoodSource,
  Meal,
  NutrientAmount,
  NutrientId,
  ServingSize,
  ServingUnit,
  WeightMeasurement,
  WeightUnit,
} from './models.ts';

const SERVING_UNITS: readonly ServingUnit[] = ['g', 'kg', 'oz', 'ml', 'l', 'serving'];
const WEIGHT_UNITS: readonly WeightUnit[] = ['kg', 'lb'];
const FOOD_SOURCES: readonly FoodSource[] = ['user_entered', 'verified', 'estimated'];
const NUTRIENT_IDS = Object.keys(NUTRIENT_UNITS) as NutrientId[];

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return nonEmptyString(value, label);
}

function finiteNumber(value: unknown, label: string, allowZero = true): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (allowZero ? value < 0 : value <= 0)
  ) {
    throw new TypeError(`${label} must be a finite ${allowZero ? 'non-negative' : 'positive'} number`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  const parsed = nonEmptyString(value, label);
  const datePart = parsed.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(parsed) ||
    !Number.isFinite(Date.parse(parsed)) ||
    !isValidCalendarDate(datePart)
  ) {
    throw new TypeError(`${label} must be an ISO 8601 timestamp`);
  }
  return parsed;
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function servingSize(value: unknown, label: string): ServingSize {
  const record = object(value, label);
  const quantity = finiteNumber(record.quantity, `${label}.quantity`, false);
  if (typeof record.unit !== 'string' || !SERVING_UNITS.includes(record.unit as ServingUnit)) {
    throw new TypeError(`${label}.unit is not a supported serving unit`);
  }
  return { quantity, unit: record.unit as ServingUnit };
}

function unitFamily(unit: ServingUnit): 'mass' | 'volume' | 'serving' {
  if (unit === 'g' || unit === 'kg' || unit === 'oz') return 'mass';
  if (unit === 'ml' || unit === 'l') return 'volume';
  return 'serving';
}

function parseNutrients(value: unknown): NutrientAmount[] {
  if (!Array.isArray(value)) throw new TypeError('food.nutrients must be an array');
  const seen = new Set<NutrientId>();
  return value.map((item, index) => {
    const record = object(item, `food.nutrients[${index}]`);
    if (typeof record.nutrient !== 'string' || !NUTRIENT_IDS.includes(record.nutrient as NutrientId)) {
      throw new TypeError(`food.nutrients[${index}].nutrient is not supported`);
    }
    const nutrient = record.nutrient as NutrientId;
    if (seen.has(nutrient)) throw new TypeError(`food.nutrients contains duplicate ${nutrient}`);
    seen.add(nutrient);
    if (record.unit !== NUTRIENT_UNITS[nutrient]) {
      throw new TypeError(`food.nutrients[${index}].unit must be ${NUTRIENT_UNITS[nutrient]}`);
    }
    return {
      nutrient,
      quantity: finiteNumber(record.quantity, `food.nutrients[${index}].quantity`),
      unit: NUTRIENT_UNITS[nutrient],
    };
  });
}

export function parseFood(value: unknown): Food {
  const record = object(value, 'food');
  const serving = servingSize(record.servingSize, 'food.servingSize');
  const basis = servingSize(record.nutritionBasis, 'food.nutritionBasis');
  if (unitFamily(serving.unit) !== unitFamily(basis.unit)) {
    throw new TypeError('food.servingSize and food.nutritionBasis must use compatible units');
  }
  if (typeof record.source !== 'string' || !FOOD_SOURCES.includes(record.source as FoodSource)) {
    throw new TypeError('food.source is not supported');
  }
  return {
    id: nonEmptyString(record.id, 'food.id'),
    name: nonEmptyString(record.name, 'food.name'),
    brand: nullableString(record.brand, 'food.brand'),
    servingSize: serving,
    nutritionBasis: basis,
    nutrients: parseNutrients(record.nutrients),
    source: record.source as FoodSource,
    sourceDetails: nullableString(record.sourceDetails, 'food.sourceDetails'),
    createdAt: timestamp(record.createdAt, 'food.createdAt'),
    updatedAt: timestamp(record.updatedAt, 'food.updatedAt'),
  };
}

export function parseMeal(value: unknown): Meal {
  const record = object(value, 'meal');
  const sortOrder = finiteNumber(record.sortOrder, 'meal.sortOrder');
  if (!Number.isInteger(sortOrder)) throw new TypeError('meal.sortOrder must be an integer');
  return {
    id: nonEmptyString(record.id, 'meal.id'),
    name: nonEmptyString(record.name, 'meal.name'),
    sortOrder,
    createdAt: timestamp(record.createdAt, 'meal.createdAt'),
    updatedAt: timestamp(record.updatedAt, 'meal.updatedAt'),
  };
}

export function parseFoodLogEntry(value: unknown): FoodLogEntry {
  const record = object(value, 'foodLogEntry');
  const quantity = finiteNumber(record.consumedQuantity, 'foodLogEntry.consumedQuantity', false);
  if (
    typeof record.consumedUnit !== 'string' ||
    !SERVING_UNITS.includes(record.consumedUnit as ServingUnit)
  ) {
    throw new TypeError('foodLogEntry.consumedUnit is not supported');
  }
  return {
    id: nonEmptyString(record.id, 'foodLogEntry.id'),
    foodId: nonEmptyString(record.foodId, 'foodLogEntry.foodId'),
    mealId: nonEmptyString(record.mealId, 'foodLogEntry.mealId'),
    loggedDate: parseLocalDate(record.loggedDate, 'foodLogEntry.loggedDate'),
    consumedQuantity: quantity,
    consumedUnit: record.consumedUnit as ServingUnit,
    loggedAt: timestamp(record.loggedAt, 'foodLogEntry.loggedAt'),
    createdAt: timestamp(record.createdAt, 'foodLogEntry.createdAt'),
    updatedAt: timestamp(record.updatedAt, 'foodLogEntry.updatedAt'),
  };
}

export function parseLocalDate(value: unknown, label = 'date'): string {
  const date = nonEmptyString(value, label);
  if (!isValidCalendarDate(date)) {
    throw new TypeError(`${label} must be a valid YYYY-MM-DD local calendar date`);
  }
  return date;
}

export function parseDailyGoal(value: unknown): DailyGoal {
  const record = object(value, 'dailyGoal');
  const effectiveDate = parseLocalDate(record.effectiveDate, 'dailyGoal.effectiveDate');
  const optionalAmount = (key: string) =>
    record[key] === null ? null : finiteNumber(record[key], `dailyGoal.${key}`);
  return {
    id: nonEmptyString(record.id, 'dailyGoal.id'),
    effectiveDate,
    caloriesKcal: optionalAmount('caloriesKcal'),
    proteinG: optionalAmount('proteinG'),
    carbohydrateG: optionalAmount('carbohydrateG'),
    fatG: optionalAmount('fatG'),
    createdAt: timestamp(record.createdAt, 'dailyGoal.createdAt'),
    updatedAt: timestamp(record.updatedAt, 'dailyGoal.updatedAt'),
  };
}

export function parseWeightMeasurement(value: unknown): WeightMeasurement {
  const record = object(value, 'weightMeasurement');
  if (typeof record.unit !== 'string' || !WEIGHT_UNITS.includes(record.unit as WeightUnit)) {
    throw new TypeError('weightMeasurement.unit is not supported');
  }
  return {
    id: nonEmptyString(record.id, 'weightMeasurement.id'),
    quantity: finiteNumber(record.quantity, 'weightMeasurement.quantity', false),
    unit: record.unit as WeightUnit,
    measuredAt: timestamp(record.measuredAt, 'weightMeasurement.measuredAt'),
    note: nullableString(record.note, 'weightMeasurement.note'),
    createdAt: timestamp(record.createdAt, 'weightMeasurement.createdAt'),
  };
}

export function parseAppSettings(value: unknown): AppSettings {
  const record = object(value, 'appSettings');
  if (record.id !== 'local') throw new TypeError('appSettings.id must be "local"');
  if (typeof record.preferredWeightUnit !== 'string' || !WEIGHT_UNITS.includes(record.preferredWeightUnit as WeightUnit)) {
    throw new TypeError('appSettings.preferredWeightUnit is not supported');
  }
  return {
    id: 'local',
    preferredWeightUnit: record.preferredWeightUnit as WeightUnit,
    createdAt: timestamp(record.createdAt, 'appSettings.createdAt'),
    updatedAt: timestamp(record.updatedAt, 'appSettings.updatedAt'),
  };
}
