import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { migrateDatabase } from '../src/data/migrations.ts';
import { createRepositories } from '../src/data/repositories.ts';
import {
  calculateDailyNutritionTotals,
} from '../src/domain/food-log.ts';
import {
  calculateProviderFoodNutrition,
  FdcApiError,
  normalizeFdcFoodDetails,
  normalizeFdcSearchResponse,
  UsdaFoodDataCentralProvider,
} from '../src/services/usda-food-data-central.ts';

const nutrients = [
  { nutrient: { number: '208', unitName: 'KCAL' }, amount: 240 },
  { nutrient: { number: '203', unitName: 'G' }, amount: 8 },
  { nutrient: { number: '205', unitName: 'G' }, amount: 30 },
  { nutrient: { number: '204', unitName: 'G' }, amount: 4 },
];

function brandedDetails(overrides = {}) {
  return {
    fdcId: 12345,
    description: 'Plain Greek Yogurt',
    dataType: 'Branded',
    brandOwner: 'Example Foods',
    servingSize: 170,
    servingSizeUnit: 'g',
    householdServingFullText: '1 container',
    foodNutrients: nutrients,
    ...overrides,
  };
}

function createDatabase(filename = ':memory:') {
  const rawDatabase = new DatabaseSync(filename);
  rawDatabase.exec('PRAGMA foreign_keys = ON');
  const database = {
    async execAsync(source) {
      rawDatabase.exec(source);
    },
    async runAsync(source, ...params) {
      const result = rawDatabase.prepare(source).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getFirstAsync(source, ...params) {
      return rawDatabase.prepare(source).get(...params) ?? null;
    },
    async getAllAsync(source, ...params) {
      return rawDatabase.prepare(source).all(...params);
    },
    async withTransactionAsync(task) {
      rawDatabase.exec('BEGIN IMMEDIATE');
      try {
        await task(database);
        rawDatabase.exec('COMMIT');
      } catch (error) {
        rawDatabase.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { database, close: () => rawDatabase.close() };
}

test('USDA search responses are validated and deduplicated', () => {
  assert.deepEqual(normalizeFdcSearchResponse({ foods: [] }), []);
  assert.deepEqual(
    normalizeFdcSearchResponse({
      foods: [
        { fdcId: 12345, description: 'Yogurt', dataType: 'Branded', brandOwner: 'Example' },
        { fdcId: 12345, description: 'Duplicate', dataType: 'Branded' },
      ],
    }),
    [{ fdcId: 12345, description: 'Yogurt', dataType: 'Branded', brandOwner: 'Example' }],
  );
  assert.throws(() => normalizeFdcSearchResponse({ foods: [{ fdcId: 'bad' }] }), FdcApiError);
  assert.throws(() => normalizeFdcSearchResponse({ foods: {} }), /invalid search result list/);
});

test('USDA branded details use per-100g nutrients and preserve omitted nutrient values', () => {
  const details = normalizeFdcFoodDetails(
    brandedDetails({
      foodNutrients: nutrients.slice(0, 2),
    }),
  );
  assert.equal(details.food.servingSize.quantity, 170);
  assert.equal(details.food.servingSize.unit, 'g');
  assert.equal(details.food.nutritionBasis.quantity, 100);
  assert.equal(details.food.source, 'verified');
  assert.match(details.food.sourceDetails, /FDC ID 12345/);
  assert.equal(details.referenceServing, '1 container');

  const half = calculateProviderFoodNutrition(details, 50);
  assert.equal(half.nutrients.energy.quantity, 120);
  assert.equal(half.nutrients.protein.quantity, 4);
  assert.equal(half.nutrients.fat, undefined);
  assert.ok(half.missingNutrients.includes('fat'));
  assert.throws(
    () => normalizeFdcFoodDetails(brandedDetails({ servingSizeUnit: 'oz' })),
    /unsupported/,
  );
  assert.throws(
    () => normalizeFdcFoodDetails(brandedDetails({
      foodNutrients: [{ nutrient: { number: '203', unitName: 'kcal' }, amount: 8 }],
    })),
    /unexpected unit/,
  );
});

test('USDA generic foods normalize portion descriptions without assuming non-gram conversions', () => {
  const details = normalizeFdcFoodDetails({
    fdcId: 987,
    description: 'Strawberries, raw',
    dataType: 'Foundation',
    foodNutrients: nutrients,
    foodPortions: [{ gramWeight: 144, portionDescription: '1 cup, halves' }],
  });
  assert.equal(details.food.servingSize.quantity, 144);
  assert.equal(details.food.servingSize.unit, 'g');
  assert.equal(details.food.nutritionBasis.quantity, 100);
  assert.equal(details.referenceServing, '1 cup, halves (144 g)');
  assert.ok(
    Math.abs(calculateProviderFoodNutrition(details, 144).nutrients.energy.quantity - 345.6) < 1e-10,
  );
});

test('USDA provider sends bounded search and detail requests and surfaces configuration/network failures', async () => {
  const requests = [];
  const provider = new UsdaFoodDataCentralProvider(
    'https://proxy.example.test/fdc/v1',
    async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify(
        requests.length === 1
          ? { foods: [{ fdcId: 12345, description: 'Yogurt', dataType: 'Branded' }] }
          : brandedDetails(),
      ));
    },
  );

  const matches = await provider.searchFoods(' yogurt ');
  assert.equal(matches.length, 1);
  assert.equal(requests[0].url, 'https://proxy.example.test/fdc/v1/foods/search');
  assert.doesNotMatch(requests[0].url, /api_key|DEMO_KEY/);
  assert.equal(requests[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    query: 'yogurt',
    pageSize: 25,
    pageNumber: 1,
  });
  assert.equal((await provider.getFoodDetails(12345)).fdcId, 12345);
  assert.equal(requests[1].url, 'https://proxy.example.test/fdc/v1/food/12345');
  assert.doesNotMatch(requests[1].url, /api_key|DEMO_KEY/);
  await assert.rejects(provider.searchFoods('  '), /Enter a food name/);
  assert.deepEqual(
    await new UsdaFoodDataCentralProvider(
      'https://proxy.example.test/fdc/v1',
      async () => new Response(JSON.stringify({ foods: [] })),
    ).searchFoods('missing food'),
    [],
  );

  await assert.rejects(
    new UsdaFoodDataCentralProvider(undefined).searchFoods('yogurt'),
    (error) =>
      error instanceof FdcApiError &&
      error.kind === 'configuration' &&
      /approved server-side proxy/.test(error.message),
  );
  await assert.rejects(
    new UsdaFoodDataCentralProvider('key', async () => {
      throw new Error('offline');
    }).searchFoods('yogurt'),
    (error) => error instanceof FdcApiError && error.kind === 'network',
  );
});

test('USDA provider distinguishes rate limits, HTTP errors, invalid JSON, and timeouts', async () => {
  await assert.rejects(
    new UsdaFoodDataCentralProvider('key', async () => new Response('', { status: 429 }))
      .searchFoods('oats'),
    (error) => error instanceof FdcApiError && error.kind === 'rate_limit',
  );
  await assert.rejects(
    new UsdaFoodDataCentralProvider('key', async () => new Response('', { status: 403 }))
      .searchFoods('oats'),
    /proxy rejected the request/,
  );
  await assert.rejects(
    new UsdaFoodDataCentralProvider('key', async () => new Response('not json'))
      .searchFoods('oats'),
    /unreadable data/,
  );

  const hangingFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
  await assert.rejects(
    new UsdaFoodDataCentralProvider('key', hangingFetch, 1).searchFoods('oats'),
    (error) => error instanceof FdcApiError && error.kind === 'timeout',
  );
});

test('provider foods can be transactionally logged and included in the selected-day totals', async () => {
  const filename = join(tmpdir(), `caloriecoach-usda-${randomUUID()}.db`);
  const initial = createDatabase(filename);
  try {
    await migrateDatabase(initial.database);
    const repositories = createRepositories(initial.database);
    const [meal] = await repositories.meals.ensureDefaults('2026-03-08T12:00:00.000Z');
    const details = normalizeFdcFoodDetails(brandedDetails());
    const now = '2026-03-08T12:00:00.000Z';
    const food = {
      ...details.food,
      id: 'local-fdc-12345',
      createdAt: now,
      updatedAt: now,
    };
    const entry = {
      id: 'entry-fdc-1',
      foodId: food.id,
      mealId: meal.id,
      loggedDate: '2026-03-08',
      consumedQuantity: 85,
      consumedUnit: 'g',
      loggedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await repositories.foodLogEntries.logFood(food, entry);
    const day = await repositories.foodLogEntries.listForDate('2026-03-08');
    assert.equal(day.length, 1);
    assert.equal(day[0].food.source, 'verified');
    assert.equal(calculateDailyNutritionTotals(day).caloriesKcal, 204);
    assert.deepEqual(await repositories.foodLogEntries.listForDate('2026-03-09'), []);
  } finally {
    initial.close();
  }

  const reopened = createDatabase(filename);
  try {
    await migrateDatabase(reopened.database);
    const saved = await createRepositories(reopened.database).foodLogEntries.listForDate('2026-03-08');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].food.sourceDetails, 'USDA FoodData Central; FDC ID 12345; Branded');
  } finally {
    reopened.close();
    if (existsSync(filename)) unlinkSync(filename);
  }
});

test('saved custom foods can be reused offline without changing the saved food version', async () => {
  const { database, close } = createDatabase();
  try {
    await migrateDatabase(database);
    const repositories = createRepositories(database);
    const [meal] = await repositories.meals.ensureDefaults('2026-03-08T12:00:00.000Z');
    const customFood = {
      id: 'custom-food-1',
      name: 'Homemade soup',
      brand: null,
      servingSize: { quantity: 1, unit: 'serving' },
      nutritionBasis: { quantity: 1, unit: 'serving' },
      nutrients: [
        { nutrient: 'energy', quantity: 180, unit: 'kcal' },
        { nutrient: 'protein', quantity: 12, unit: 'g' },
        { nutrient: 'carbohydrate', quantity: 20, unit: 'g' },
        { nutrient: 'fat', quantity: 5, unit: 'g' },
      ],
      source: 'user_entered',
      sourceDetails: 'Manually entered',
      createdAt: '2026-03-08T12:00:00.000Z',
      updatedAt: '2026-03-08T12:00:00.000Z',
    };
    await repositories.foods.save(customFood);
    const loggedFood = {
      ...customFood,
      id: 'custom-food-log-copy',
      createdAt: '2026-03-08T12:05:00.000Z',
      updatedAt: '2026-03-08T12:05:00.000Z',
    };
    await repositories.foodLogEntries.logFood(loggedFood, {
      id: 'custom-food-entry-1',
      foodId: loggedFood.id,
      mealId: meal.id,
      loggedDate: '2026-03-08',
      consumedQuantity: 2,
      consumedUnit: 'serving',
      loggedAt: '2026-03-08T12:05:00.000Z',
      createdAt: '2026-03-08T12:05:00.000Z',
      updatedAt: '2026-03-08T12:05:00.000Z',
    });

    const savedFoods = await repositories.foods.list();
    const selected = savedFoods.find((food) => food.name === 'Homemade soup');
    assert.ok(selected);
    assert.equal((await repositories.foods.getById(customFood.id)).createdAt, customFood.createdAt);
    const day = await repositories.foodLogEntries.listForDate('2026-03-08');
    assert.equal(day[0].food.id, loggedFood.id);
    assert.equal(calculateDailyNutritionTotals(day).caloriesKcal, 360);
    assert.equal((await repositories.foods.list()).length, 2);
  } finally {
    close();
  }
});
