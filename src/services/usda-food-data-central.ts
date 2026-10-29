import { NUTRIENT_UNITS } from '../domain/models.ts';
import type { Food, NutrientAmount, ServingUnit } from '../domain/models.ts';
import { calculateFoodNutrition } from '../domain/nutrition.ts';
import { parseFood } from '../domain/validation.ts';

const SEARCH_PAGE_SIZE = 25;

const NUTRIENT_NUMBERS: Record<string, NutrientAmount['nutrient']> = {
  '203': 'protein',
  '204': 'fat',
  '205': 'carbohydrate',
  '208': 'energy',
  '291': 'fiber',
  '307': 'sodium',
};

const FDC_DATA_TYPES = ['Branded', 'Foundation', 'Survey (FNDDS)', 'SR Legacy', 'Experimental'] as const;

export type FdcDataType = (typeof FDC_DATA_TYPES)[number];
export type NutritionBasisUnit = 'g' | 'ml';

export interface FoodSearchMatch {
  fdcId: number;
  description: string;
  dataType: FdcDataType;
  brandOwner: string | null;
}

export interface NutritionFoodDetails extends FoodSearchMatch {
  food: Food;
  nutritionBasisUnit: NutritionBasisUnit;
  referenceServing: string | null;
}

export interface NutritionFoodProvider {
  searchFoods(query: string): Promise<FoodSearchMatch[]>;
  getFoodDetails(fdcId: number): Promise<NutritionFoodDetails>;
}

export type FdcApiErrorKind =
  | 'configuration'
  | 'timeout'
  | 'network'
  | 'rate_limit'
  | 'http'
  | 'invalid_response';

export class FdcApiError extends Error {
  readonly kind: FdcApiErrorKind;

  constructor(
    kind: FdcApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'FdcApiError';
    this.kind = kind;
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FdcApiError('invalid_response', `USDA returned an invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FdcApiError('invalid_response', `USDA returned an invalid ${label}.`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new FdcApiError('invalid_response', `USDA returned an invalid ${label}.`);
  }
  return value;
}

function dataType(value: unknown): FdcDataType {
  if (typeof value === 'string' && FDC_DATA_TYPES.includes(value as FdcDataType)) {
    return value as FdcDataType;
  }
  throw new FdcApiError('invalid_response', 'USDA returned an unsupported food data type.');
}

function normalizeNutritionBasisUnit(value: unknown): NutritionBasisUnit {
  if (typeof value !== 'string') {
    throw new FdcApiError(
      'invalid_response',
      'USDA did not provide a supported nutrition basis for this food.',
    );
  }
  const unit = value.trim().toLowerCase();
  if (['g', 'gram', 'grams'].includes(unit)) return 'g';
  if (['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'].includes(unit)) return 'ml';
  throw new FdcApiError(
    'invalid_response',
    `USDA serving unit "${value}" is unsupported. Choose another result or enter the food manually.`,
  );
}

function optionalPositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeNutrients(value: unknown): NutrientAmount[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new FdcApiError('invalid_response', 'USDA returned invalid nutrient details.');
  }

  const nutrients: NutrientAmount[] = [];
  const seen = new Set<NutrientAmount['nutrient']>();
  for (const [index, item] of value.entries()) {
    const nutrientRecord = record(item, `nutrient ${index + 1}`);
    const nutrient = record(nutrientRecord.nutrient, `nutrient ${index + 1}`);
    const number = typeof nutrient.number === 'string' ? nutrient.number : '';
    const nutrientId = NUTRIENT_NUMBERS[number];
    if (!nutrientId) continue;

    const expectedUnit = NUTRIENT_UNITS[nutrientId];
    if (
      typeof nutrient.unitName !== 'string' ||
      nutrient.unitName.trim().toLowerCase() !== expectedUnit
    ) {
      throw new FdcApiError(
        'invalid_response',
        `USDA returned an unexpected unit for ${nutrientId}.`,
      );
    }

    if (nutrientRecord.amount === undefined || nutrientRecord.amount === null) continue;
    if (
      typeof nutrientRecord.amount !== 'number' ||
      !Number.isFinite(nutrientRecord.amount) ||
      nutrientRecord.amount < 0
    ) {
      throw new FdcApiError('invalid_response', `USDA returned an invalid ${nutrientId} value.`);
    }
    if (seen.has(nutrientId)) {
      throw new FdcApiError('invalid_response', `USDA returned duplicate ${nutrientId} values.`);
    }
    seen.add(nutrientId);
    nutrients.push({ nutrient: nutrientId, quantity: nutrientRecord.amount, unit: expectedUnit });
  }
  return nutrients;
}

function firstGenericPortion(value: unknown): { label: string; grams: number } | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw new FdcApiError('invalid_response', 'USDA returned invalid serving details.');
  }
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const portion = item as Record<string, unknown>;
    const grams = optionalPositiveNumber(portion.gramWeight);
    const label = optionalText(portion.portionDescription);
    if (grams !== null && label !== null) return { label, grams };
  }
  return null;
}

export function normalizeFdcSearchResponse(value: unknown): FoodSearchMatch[] {
  const response = record(value, 'search response');
  if (!Array.isArray(response.foods)) {
    throw new FdcApiError('invalid_response', 'USDA returned an invalid search result list.');
  }
  const matches = new Map<number, FoodSearchMatch>();
  for (const [index, item] of response.foods.entries()) {
    const food = record(item, `search result ${index + 1}`);
    const fdcId = positiveInteger(food.fdcId, 'food identifier');
    if (matches.has(fdcId)) continue;
    matches.set(fdcId, {
      fdcId,
      description: requiredText(food.description, 'food description'),
      dataType: dataType(food.dataType),
      brandOwner: optionalText(food.brandOwner),
    });
  }
  return [...matches.values()];
}

export function normalizeFdcFoodDetails(value: unknown): NutritionFoodDetails {
  const details = record(value, 'food details');
  const fdcId = positiveInteger(details.fdcId, 'food identifier');
  const description = requiredText(details.description, 'food description');
  const typeValue = details.dataType ?? details.datatype;
  const type = dataType(typeValue);
  const brandOwner = optionalText(details.brandOwner);
  const basisUnit =
    type === 'Branded' ? normalizeNutritionBasisUnit(details.servingSizeUnit) : 'g';
  const rawServingSize =
    type === 'Branded' && typeof details.servingSize === 'number'
      ? optionalPositiveNumber(details.servingSize)
      : null;
  const portion = type === 'Branded' ? null : firstGenericPortion(details.foodPortions);
  const servingQuantity =
    basisUnit === 'g' && portion
      ? portion.grams
      : rawServingSize ?? 100;
  const servingSizeUnit: ServingUnit = basisUnit;
  const nutrients = normalizeNutrients(details.foodNutrients);
  const householdServing =
    type === 'Branded' ? optionalText(details.householdServingFullText) : null;
  const referenceServing =
    householdServing ??
    (portion ? `${portion.label} (${portion.grams} g)` : `${servingQuantity} ${basisUnit}`);
  const timestamp = new Date().toISOString();
  const food = parseFood({
    id: `fdc-${fdcId}`,
    name: description,
    brand: brandOwner,
    servingSize: { quantity: servingQuantity, unit: servingSizeUnit },
    nutritionBasis: { quantity: 100, unit: basisUnit },
    nutrients,
    source: 'verified',
    sourceDetails: `USDA FoodData Central; FDC ID ${fdcId}; ${type}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return {
    fdcId,
    description,
    dataType: type,
    brandOwner,
    food,
    nutritionBasisUnit: basisUnit,
    referenceServing,
  };
}

export class UsdaFoodDataCentralProvider implements NutritionFoodProvider {
  private readonly proxyBaseUrl: string | undefined;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    proxyBaseUrl: string | undefined,
    fetchImplementation: typeof fetch = fetch,
    timeoutMs = 12_000,
  ) {
    this.proxyBaseUrl = proxyBaseUrl;
    this.fetchImplementation = fetchImplementation;
    this.timeoutMs = timeoutMs;
  }

  async searchFoods(query: string): Promise<FoodSearchMatch[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new FdcApiError('invalid_response', 'Enter a food name to search.');
    }
    const result = await this.requestJson('/foods/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: normalizedQuery,
        pageSize: SEARCH_PAGE_SIZE,
        pageNumber: 1,
      }),
    });
    return normalizeFdcSearchResponse(result);
  }

  async getFoodDetails(fdcId: number): Promise<NutritionFoodDetails> {
    if (!Number.isSafeInteger(fdcId) || fdcId <= 0) {
      throw new FdcApiError('invalid_response', 'Select a valid USDA food result.');
    }
    const details = normalizeFdcFoodDetails(
      await this.requestJson(`/food/${fdcId}`, { method: 'GET' }),
    );
    if (details.fdcId !== fdcId) {
      throw new FdcApiError('invalid_response', 'USDA returned a different food than requested.');
    }
    return details;
  }

  private async requestJson(path: string, init: RequestInit): Promise<unknown> {
    if (!this.proxyBaseUrl?.trim()) {
      throw new FdcApiError(
        'configuration',
        'Live USDA search is disabled until an approved server-side proxy is configured. Use manual entry for now.',
      );
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const url = `${this.proxyBaseUrl.replace(/\/+$/, '')}${path}`;
    try {
      let response: Response;
      try {
        response = await this.fetchImplementation(url, { ...init, signal: controller.signal });
      } catch {
        if (timedOut) {
          throw new FdcApiError('timeout', 'The USDA search service did not respond in time. Try again.');
        }
        throw new FdcApiError(
          'network',
          'Could not reach the USDA search service. Check your connection or use manual entry.',
        );
      }

      if (response.status === 429) {
        throw new FdcApiError(
          'rate_limit',
          'The USDA search service is temporarily rate-limited. Wait before trying again, or use manual entry.',
        );
      }
      if (!response.ok) {
        throw new FdcApiError(
          'http',
          response.status === 401 || response.status === 403
            ? 'The USDA search proxy rejected the request. Try again later or use manual entry.'
            : `USDA search proxy failed (HTTP ${response.status}). Try again or use manual entry.`,
        );
      }
      try {
        return await response.json();
      } catch {
        throw new FdcApiError('invalid_response', 'USDA returned unreadable data. Try again later.');
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function calculateProviderFoodNutrition(
  details: NutritionFoodDetails,
  amount: number,
) {
  return calculateFoodNutrition(details.food, amount, details.nutritionBasisUnit);
}
