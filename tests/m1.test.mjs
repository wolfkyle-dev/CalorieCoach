import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { migrateDatabase, schemaMigrations } from '../src/data/migrations.ts';
import { createRepositories } from '../src/data/repositories.ts';
import {
  calculateDailyNutritionTotals,
  createEmptyDailyNutritionTotals,
  createManualFoodRecord,
  formatLocalDate,
  getLocalDateString,
  shiftLocalDate,
} from '../src/domain/food-log.ts';
import { calculateFoodNutrition, convertServingQuantity } from '../src/domain/nutrition.ts';
import {
  parseAppSettings,
  parseDailyGoal,
  parseFood,
  parseFoodLogEntry,
  parseMeal,
  parseWeightMeasurement,
} from '../src/domain/validation.ts';

const now = '2026-10-28T12:00:00.000Z';

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

function food(overrides = {}) {
  return {
    id: 'food-oats',
    name: 'Oats',
    brand: null,
    servingSize: { quantity: 40, unit: 'g' },
    nutritionBasis: { quantity: 100, unit: 'g' },
    nutrients: [
      { nutrient: 'energy', quantity: 380, unit: 'kcal' },
      { nutrient: 'protein', quantity: 13, unit: 'g' },
    ],
    source: 'user_entered',
    sourceDetails: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function meal(overrides = {}) {
  return {
    id: 'meal-breakfast',
    name: 'Breakfast',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test('domain validation rejects invalid amounts, units, provenance, and timestamps', () => {
  assert.throws(() => parseFood(food({ nutritionBasis: { quantity: 0, unit: 'g' } })));
  assert.throws(() => parseFood(food({ servingSize: { quantity: 1, unit: 'serving' } })));
  assert.throws(() =>
    parseFood(food({ nutrients: [{ nutrient: 'energy', quantity: 12, unit: 'g' }] })),
  );
  assert.throws(() =>
    parseFood(
      food({
        nutrients: [
          { nutrient: 'protein', quantity: 2, unit: 'g' },
          { nutrient: 'protein', quantity: 3, unit: 'g' },
        ],
      }),
    ),
  );
  assert.throws(() => parseMeal(meal({ sortOrder: -1 })));
  assert.throws(() => parseFoodLogEntry({
    id: '',
    foodId: 'food-oats',
    mealId: 'meal-breakfast',
    loggedDate: '2026-10-28',
    consumedQuantity: 1,
    consumedUnit: 'g',
    loggedAt: now,
    createdAt: now,
    updatedAt: now,
  }));
  assert.throws(() => parseDailyGoal({
    id: 'goal',
    effectiveDate: '2026-02-31',
    caloriesKcal: null,
    proteinG: null,
    carbohydrateG: null,
    fatG: null,
    createdAt: now,
    updatedAt: now,
  }));
  assert.throws(() => parseWeightMeasurement({
    id: 'weight',
    quantity: 0,
    unit: 'kg',
    measuredAt: now,
    note: null,
    createdAt: now,
  }));
  assert.throws(() => parseAppSettings({
    id: 'local',
    preferredWeightUnit: 'stone',
    createdAt: now,
    updatedAt: now,
  }));
});

test('serving conversions are explicit and food calculations preserve missing nutrients', () => {
  assert.equal(convertServingQuantity(1, 'kg', 'g'), 1000);
  assert.equal(convertServingQuantity(1, 'oz', 'g'), 28.349523125);
  assert.throws(() => convertServingQuantity(1, 'g', 'ml'));
  const result = calculateFoodNutrition(food(), 50, 'g');
  assert.equal(result.nutrients.energy?.quantity, 190);
  assert.equal(result.nutrients.protein?.quantity, 6.5);
  assert.equal(result.nutrients.fat, undefined);
  assert.ok(result.missingNutrients.includes('fat'));
  assert.throws(() => calculateFoodNutrition(food(), 1, 'ml'));
});

test('repositories persist, read, update, list, and delete records with referential integrity', async () => {
  const { database, close } = createDatabase();
  try {
    await migrateDatabase(database);
    const repositories = createRepositories(database);

    const savedFood = await repositories.foods.save(food());
    assert.deepEqual(savedFood, food());
    assert.deepEqual(await repositories.foods.getById(savedFood.id), savedFood);
    assert.equal((await repositories.foods.list()).length, 1);

    await repositories.meals.save(meal());
    await repositories.foodLogEntries.save({
      id: 'entry-1',
      foodId: 'food-oats',
      mealId: 'meal-breakfast',
      loggedDate: '2026-10-28',
      consumedQuantity: 40,
      consumedUnit: 'g',
      loggedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await assert.rejects(
      repositories.foodLogEntries.save({
        id: 'entry-invalid-unit',
        foodId: 'food-oats',
        mealId: 'meal-breakfast',
        loggedDate: '2026-10-28',
        consumedQuantity: 1,
        consumedUnit: 'ml',
        loggedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      /Cannot convert ml to g/,
    );
    await assert.rejects(repositories.foods.delete('food-oats'));
    assert.equal((await repositories.foodLogEntries.list()).length, 1);

    await repositories.foodLogEntries.save({
      id: 'entry-1',
      foodId: 'food-oats',
      mealId: 'meal-breakfast',
      loggedDate: '2026-10-28',
      consumedQuantity: 80,
      consumedUnit: 'g',
      loggedAt: now,
      createdAt: now,
      updatedAt: '2026-10-28T12:05:00.000Z',
    });
    assert.equal((await repositories.foodLogEntries.list()).length, 1);
    assert.equal((await repositories.foodLogEntries.getById('entry-1'))?.consumedQuantity, 80);

    await repositories.dailyGoals.save({
      id: 'goal-1',
      effectiveDate: '2026-10-28',
      caloriesKcal: 2000,
      proteinG: null,
      carbohydrateG: null,
      fatG: null,
      createdAt: now,
      updatedAt: now,
    });
    assert.equal((await repositories.dailyGoals.getForDate('2026-10-28'))?.proteinG, null);

    await repositories.weightMeasurements.save({
      id: 'weight-1',
      quantity: 72.5,
      unit: 'kg',
      measuredAt: now,
      note: null,
      createdAt: now,
    });
    assert.equal((await repositories.weightMeasurements.getById('weight-1'))?.quantity, 72.5);

    const defaultSettings = await repositories.settings.getOrCreate(now);
    assert.equal(defaultSettings.preferredWeightUnit, 'kg');
    const updatedSettings = await repositories.settings.updateWeightUnit('lb', '2026-10-28T12:10:00.000Z');
    assert.equal(updatedSettings.preferredWeightUnit, 'lb');
    assert.equal((await repositories.settings.getOrCreate())?.updatedAt, '2026-10-28T12:10:00.000Z');

    assert.equal(await repositories.foodLogEntries.delete('entry-1'), true);
    assert.equal(await repositories.foodLogEntries.delete('entry-1'), false);
    assert.equal(await repositories.foods.delete('food-oats'), true);
    assert.equal(await repositories.meals.delete('meal-breakfast'), true);
    assert.equal(await repositories.dailyGoals.delete('goal-1'), true);
    assert.equal(await repositories.weightMeasurements.delete('weight-1'), true);
  } finally {
    close();
  }
});

test('a failed food nutrient write rolls back its related food update', async () => {
  const { database, close } = createDatabase();
  try {
    await migrateDatabase(database);
    const foods = createRepositories(database).foods;
    await foods.save(food());
    await database.execAsync(`
      CREATE TRIGGER reject_protein BEFORE INSERT ON food_nutrients
      WHEN NEW.nutrient = 'protein'
      BEGIN SELECT RAISE(ABORT, 'test nutrient failure'); END;
    `);

    await assert.rejects(
      foods.save(food({
        name: 'Updated oats',
        nutrients: [
          { nutrient: 'energy', quantity: 400, unit: 'kcal' },
          { nutrient: 'protein', quantity: 15, unit: 'g' },
        ],
      })),
      /test nutrient failure/,
    );
    const saved = await foods.getById('food-oats');
    assert.equal(saved?.name, 'Oats');
    assert.equal(saved?.nutrients.find((nutrient) => nutrient.nutrient === 'energy')?.quantity, 380);
  } finally {
    close();
  }
});

test('schema migration upgrades v1 while retaining existing food data', async () => {
  const { database, close } = createDatabase();
  try {
    await schemaMigrations[0].up(database);
    await database.execAsync('PRAGMA user_version = 1');
    const repositories = createRepositories(database);
    await repositories.foods.save(food());

    await migrateDatabase(database);

    const version = await database.getFirstAsync('PRAGMA user_version');
    assert.equal(version.user_version, 3);
    assert.deepEqual(await repositories.foods.getById('food-oats'), food());
    assert.equal((await repositories.settings.getOrCreate(now)).preferredWeightUnit, 'kg');
  } finally {
    close();
  }
});

test('manual food input validates required fields and rejects malformed or negative numbers', () => {
  const draft = {
    name: ' Toast ',
    servingAmount: '1',
    servingUnit: 'serving',
    consumedAmount: '0.5',
    caloriesKcal: '120',
    proteinG: '4',
    carbohydrateG: '22',
    fatG: '1.5',
    mealId: 'meal-breakfast',
  };
  const record = createManualFoodRecord(draft, '2026-10-28', now, 'food-1', 'entry-1');
  assert.equal(record.food.name, 'Toast');
  assert.equal(record.food.nutritionBasis.quantity, 1);
  assert.equal(record.entry.consumedQuantity, 0.5);
  assert.equal(record.entry.loggedDate, '2026-10-28');
  assert.equal(record.food.source, 'user_entered');
  assert.equal(record.food.nutrients[0].unit, 'kcal');
  assert.throws(() => createManualFoodRecord({ ...draft, name: '   ' }, '2026-10-28', now, 'f', 'e'));
  assert.throws(() => createManualFoodRecord({ ...draft, servingAmount: '' }, '2026-10-28', now, 'f', 'e'));
  assert.throws(() => createManualFoodRecord({ ...draft, consumedAmount: '0' }, '2026-10-28', now, 'f', 'e'));
  assert.throws(() => createManualFoodRecord({ ...draft, caloriesKcal: '-2' }, '2026-10-28', now, 'f', 'e'));
  assert.throws(() => createManualFoodRecord({ ...draft, proteinG: '1e2' }, '2026-10-28', now, 'f', 'e'));
  assert.throws(() => createManualFoodRecord({ ...draft, fatG: '1,5' }, '2026-10-28', now, 'f', 'e'));
  assert.throws(() => createManualFoodRecord({ ...draft, mealId: '' }, '2026-10-28', now, 'f', 'e'));
  assert.throws(() => createManualFoodRecord(draft, '2026-02-31', now, 'f', 'e'));
});

test('daily totals aggregate entries, preserve unknowns, and return zeros for an empty day', () => {
  const base = {
    food: food(),
    meal: meal(),
    entry: {
      id: 'entry-1',
      foodId: 'food-oats',
      mealId: 'meal-breakfast',
      loggedDate: '2026-10-28',
      consumedQuantity: 50,
      consumedUnit: 'g',
      loggedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  };
  const totals = calculateDailyNutritionTotals([
    base,
    {
      ...base,
      food: food({
        id: 'food-oats-2',
        name: 'Oats 2',
        nutrients: [
          { nutrient: 'energy', quantity: 200, unit: 'kcal' },
          { nutrient: 'protein', quantity: 10, unit: 'g' },
          { nutrient: 'carbohydrate', quantity: 30, unit: 'g' },
          { nutrient: 'fat', quantity: 5, unit: 'g' },
        ],
      }),
      entry: { ...base.entry, id: 'entry-2', foodId: 'food-oats-2', consumedQuantity: 100 },
    },
  ]);
  assert.equal(totals.caloriesKcal, 390);
  assert.equal(totals.proteinG, 16.5);
  assert.equal(totals.carbohydrateG, null);
  assert.equal(totals.fatG, null);
  assert.deepEqual(calculateDailyNutritionTotals([]), createEmptyDailyNutritionTotals());
});

test('food logs use explicit local dates across day boundaries and query by selected date', async () => {
  assert.equal(shiftLocalDate('2026-03-08', 1), '2026-03-09');
  assert.equal(shiftLocalDate('2026-03-09', -1), '2026-03-08');
  assert.equal(getLocalDateString(new Date(2026, 2, 8, 23, 45)), '2026-03-08');
  assert.equal(formatLocalDate('2026-10-28').includes('October'), true);

  const { database, close } = createDatabase();
  try {
    await migrateDatabase(database);
    const repositories = createRepositories(database);
    const [breakfast] = await repositories.meals.ensureDefaults(now);
    const first = createManualFoodRecord(
      {
        name: 'Toast',
        servingAmount: '1',
        servingUnit: 'serving',
        consumedAmount: '1',
        caloriesKcal: '120',
        proteinG: '4',
        carbohydrateG: '22',
        fatG: '1',
        mealId: breakfast.id,
      },
      '2026-10-28',
      now,
      'food-day-one',
      'entry-day-one',
    );
    const second = createManualFoodRecord(
      {
        name: 'Toast',
        servingAmount: '1',
        servingUnit: 'serving',
        consumedAmount: '1',
        caloriesKcal: '120',
        proteinG: '4',
        carbohydrateG: '22',
        fatG: '1',
        mealId: breakfast.id,
      },
      '2026-10-29',
      now,
      'food-day-two',
      'entry-day-two',
    );
    await repositories.foodLogEntries.logFood(first.food, first.entry);
    await repositories.foodLogEntries.logFood(second.food, second.entry);
    assert.equal((await repositories.foodLogEntries.listForDate('2026-10-28')).length, 1);
    assert.equal((await repositories.foodLogEntries.listForDate('2026-10-29')).length, 1);
    assert.deepEqual(await repositories.foodLogEntries.listForDate('2026-10-30'), []);

    await repositories.foodLogEntries.updateFoodLogEntry(
      { ...first.food, name: 'Toast edited', updatedAt: '2026-10-28T13:00:00.000Z' },
      { ...first.entry, consumedQuantity: 2, updatedAt: '2026-10-28T13:00:00.000Z' },
    );
    const edited = await repositories.foodLogEntries.listForDate('2026-10-28');
    assert.equal(edited.length, 1);
    assert.equal(edited[0].food.name, 'Toast edited');
    assert.equal(calculateDailyNutritionTotals(edited).caloriesKcal, 240);
    assert.equal(await repositories.foodLogEntries.deleteWithFood('entry-day-one'), true);
    assert.deepEqual(await repositories.foodLogEntries.listForDate('2026-10-28'), []);
    assert.equal(await repositories.foodLogEntries.deleteWithFood('entry-day-one'), false);
  } finally {
    close();
  }
});

test('a failed food-log insert rolls back its related manual food and nutrients', async () => {
  const { database, close } = createDatabase();
  try {
    await migrateDatabase(database);
    const repositories = createRepositories(database);
    await repositories.meals.ensureDefaults(now);
    const record = createManualFoodRecord(
      {
        name: 'Yogurt',
        servingAmount: '150',
        servingUnit: 'g',
        consumedAmount: '150',
        caloriesKcal: '120',
        proteinG: '15',
        carbohydrateG: '9',
        fatG: '2',
        mealId: 'meal-breakfast',
      },
      '2026-10-28',
      now,
      'food-rollback',
      'entry-rollback',
    );
    await database.execAsync(`
      CREATE TRIGGER reject_log BEFORE INSERT ON food_log_entries
      BEGIN SELECT RAISE(ABORT, 'test log failure'); END;
    `);
    await assert.rejects(
      repositories.foodLogEntries.logFood(record.food, record.entry),
      /test log failure/,
    );
    assert.equal(await repositories.foods.getById(record.food.id), null);
    assert.deepEqual(await repositories.foodLogEntries.listForDate('2026-10-28'), []);
  } finally {
    close();
  }
});

test('version 2 food logs migrate to an explicit UTC-derived legacy date', async () => {
  const { database, close } = createDatabase();
  try {
    await schemaMigrations[0].up(database);
    await schemaMigrations[1].up(database);
    await database.execAsync('PRAGMA user_version = 2');
    const repositories = createRepositories(database);
    await repositories.foods.save(food());
    await repositories.meals.save(meal());
    await database.runAsync(
      `INSERT INTO food_log_entries (
        id, food_id, meal_id, consumed_quantity, consumed_unit, logged_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'legacy-entry',
      'food-oats',
      'meal-breakfast',
      1,
      'serving',
      '2026-10-28T23:30:00.000Z',
      now,
      now,
    );
    await migrateDatabase(database);
    const entries = await repositories.foodLogEntries.listForDate('2026-10-28');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].entry.loggedDate, '2026-10-28');
  } finally {
    close();
  }
});

test('records survive closing and reopening the SQLite database', async () => {
  const filename = join(tmpdir(), `caloriecoach-${randomUUID()}.db`);
  const initial = createDatabase(filename);
  try {
    await migrateDatabase(initial.database);
    const repositories = createRepositories(initial.database);
    await repositories.foods.save(food());
    await repositories.meals.save(meal());
    await repositories.foodLogEntries.logFood(food(), {
      id: 'persistent-entry',
      foodId: 'food-oats',
      mealId: 'meal-breakfast',
      loggedDate: '2026-10-28',
      consumedQuantity: 50,
      consumedUnit: 'g',
      loggedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await repositories.settings.updateWeightUnit('lb', now);
  } finally {
    initial.close();
  }

  const reopened = createDatabase(filename);
  try {
    await migrateDatabase(reopened.database);
    const repositories = createRepositories(reopened.database);
    assert.deepEqual(await repositories.foods.getById('food-oats'), food());
    assert.equal((await repositories.foodLogEntries.listForDate('2026-10-28')).length, 1);
    assert.equal(
      (await repositories.settings.getOrCreate())?.preferredWeightUnit,
      'lb',
    );
  } finally {
    reopened.close();
    if (existsSync(filename)) unlinkSync(filename);
  }
});
