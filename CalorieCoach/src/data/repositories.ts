import type {
  AppSettings,
  DailyGoal,
  Food,
  FoodLogEntry,
  Meal,
  NutrientAmount,
  ServingUnit,
  WeightMeasurement,
  WeightUnit,
} from '../domain/models.ts';
import type { FoodLogItem } from '../domain/food-log.ts';
import { convertServingQuantity } from '../domain/nutrition.ts';
import {
  parseAppSettings,
  parseDailyGoal,
  parseFood,
  parseFoodLogEntry,
  parseMeal,
  parseWeightMeasurement,
  parseLocalDate,
} from '../domain/validation.ts';
import type { AppDatabase, SqlExecutor } from './sql.ts';

interface FoodRow {
  id: string;
  name: string;
  brand: string | null;
  serving_quantity: number;
  serving_unit: ServingUnit;
  nutrition_basis_quantity: number;
  nutrition_basis_unit: ServingUnit;
  source: Food['source'];
  source_details: string | null;
  created_at: string;
  updated_at: string;
}

interface NutrientRow {
  nutrient: NutrientAmount['nutrient'];
  quantity: number;
  unit: NutrientAmount['unit'];
}

interface MealRow {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface FoodLogEntryRow {
  id: string;
  food_id: string;
  meal_id: string;
  logged_date: string;
  consumed_quantity: number;
  consumed_unit: ServingUnit;
  logged_at: string;
  created_at: string;
  updated_at: string;
}

interface DailyGoalRow {
  id: string;
  effective_date: string;
  calories_kcal: number | null;
  protein_g: number | null;
  carbohydrate_g: number | null;
  fat_g: number | null;
  created_at: string;
  updated_at: string;
}

interface WeightMeasurementRow {
  id: string;
  quantity: number;
  unit: WeightUnit;
  measured_at: string;
  note: string | null;
  created_at: string;
}

interface AppSettingsRow {
  id: 'local';
  preferred_weight_unit: WeightUnit;
  created_at: string;
  updated_at: string;
}

const DEFAULT_MEALS = [
  { id: 'meal-breakfast', name: 'Breakfast', sortOrder: 0 },
  { id: 'meal-lunch', name: 'Lunch', sortOrder: 1 },
  { id: 'meal-dinner', name: 'Dinner', sortOrder: 2 },
  { id: 'meal-snacks', name: 'Snacks', sortOrder: 3 },
] as const;

async function persistFood(database: SqlExecutor, food: Food): Promise<void> {
  await database.runAsync(
    `INSERT INTO foods (
      id, name, brand, serving_quantity, serving_unit, nutrition_basis_quantity,
      nutrition_basis_unit, source, source_details, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, brand = excluded.brand,
      serving_quantity = excluded.serving_quantity, serving_unit = excluded.serving_unit,
      nutrition_basis_quantity = excluded.nutrition_basis_quantity,
      nutrition_basis_unit = excluded.nutrition_basis_unit,
      source = excluded.source, source_details = excluded.source_details,
      updated_at = excluded.updated_at`,
    food.id,
    food.name,
    food.brand,
    food.servingSize.quantity,
    food.servingSize.unit,
    food.nutritionBasis.quantity,
    food.nutritionBasis.unit,
    food.source,
    food.sourceDetails,
    food.createdAt,
    food.updatedAt,
  );
  await database.runAsync('DELETE FROM food_nutrients WHERE food_id = ?', food.id);
  for (const nutrient of food.nutrients) {
    await database.runAsync(
      'INSERT INTO food_nutrients (food_id, nutrient, quantity, unit) VALUES (?, ?, ?, ?)',
      food.id,
      nutrient.nutrient,
      nutrient.quantity,
      nutrient.unit,
    );
  }
}

async function persistFoodLogEntry(database: SqlExecutor, entry: FoodLogEntry): Promise<void> {
  await database.runAsync(
    `INSERT INTO food_log_entries (
      id, food_id, meal_id, consumed_quantity, consumed_unit, logged_at, created_at, updated_at,
      logged_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      food_id = excluded.food_id, meal_id = excluded.meal_id,
      consumed_quantity = excluded.consumed_quantity, consumed_unit = excluded.consumed_unit,
      logged_at = excluded.logged_at, updated_at = excluded.updated_at,
      logged_date = excluded.logged_date`,
    entry.id,
    entry.foodId,
    entry.mealId,
    entry.consumedQuantity,
    entry.consumedUnit,
    entry.loggedAt,
    entry.createdAt,
    entry.updatedAt,
    entry.loggedDate,
  );
}

async function mapFood(database: SqlExecutor, row: FoodRow): Promise<Food> {
  const nutrients = await database.getAllAsync<NutrientRow>(
    'SELECT nutrient, quantity, unit FROM food_nutrients WHERE food_id = ? ORDER BY nutrient',
    row.id,
  );
  return parseFood({
    id: row.id,
    name: row.name,
    brand: row.brand,
    servingSize: { quantity: row.serving_quantity, unit: row.serving_unit },
    nutritionBasis: { quantity: row.nutrition_basis_quantity, unit: row.nutrition_basis_unit },
    nutrients,
    source: row.source,
    sourceDetails: row.source_details,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapMeal(row: MealRow): Meal {
  return parseMeal({
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapFoodLogEntry(row: FoodLogEntryRow): FoodLogEntry {
  return parseFoodLogEntry({
    id: row.id,
    foodId: row.food_id,
    mealId: row.meal_id,
    loggedDate: row.logged_date,
    consumedQuantity: row.consumed_quantity,
    consumedUnit: row.consumed_unit,
    loggedAt: row.logged_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapDailyGoal(row: DailyGoalRow): DailyGoal {
  return parseDailyGoal({
    id: row.id,
    effectiveDate: row.effective_date,
    caloriesKcal: row.calories_kcal,
    proteinG: row.protein_g,
    carbohydrateG: row.carbohydrate_g,
    fatG: row.fat_g,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapWeightMeasurement(row: WeightMeasurementRow): WeightMeasurement {
  return parseWeightMeasurement({
    id: row.id,
    quantity: row.quantity,
    unit: row.unit,
    measuredAt: row.measured_at,
    note: row.note,
    createdAt: row.created_at,
  });
}

function mapAppSettings(row: AppSettingsRow): AppSettings {
  return parseAppSettings({
    id: row.id,
    preferredWeightUnit: row.preferred_weight_unit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function createRepositories(database: AppDatabase) {
  return {
    foods: {
      async save(input: Food): Promise<Food> {
        const food = parseFood(input);
        await database.withTransactionAsync((transaction) => persistFood(transaction, food));
        const saved = await this.getById(food.id);
        if (!saved) throw new Error(`Saved food ${food.id} could not be read`);
        return saved;
      },
      async getById(id: string): Promise<Food | null> {
        const row = await database.getFirstAsync<FoodRow>('SELECT * FROM foods WHERE id = ?', id);
        return row ? mapFood(database, row) : null;
      },
      async list(): Promise<Food[]> {
        const rows = await database.getAllAsync<FoodRow>('SELECT * FROM foods ORDER BY name, id');
        return Promise.all(rows.map((row) => mapFood(database, row)));
      },
      async delete(id: string): Promise<boolean> {
        const result = await database.runAsync('DELETE FROM foods WHERE id = ?', id);
        return result.changes > 0;
      },
    },
    meals: {
      async save(input: Meal): Promise<Meal> {
        const meal = mapMeal({
          id: input.id,
          name: input.name,
          sort_order: input.sortOrder,
          created_at: input.createdAt,
          updated_at: input.updatedAt,
        });
        await database.runAsync(
          `INSERT INTO meals (id, name, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, sort_order = excluded.sort_order, updated_at = excluded.updated_at`,
          meal.id,
          meal.name,
          meal.sortOrder,
          meal.createdAt,
          meal.updatedAt,
        );
        return meal;
      },
      async getById(id: string): Promise<Meal | null> {
        const row = await database.getFirstAsync<MealRow>('SELECT * FROM meals WHERE id = ?', id);
        return row ? mapMeal(row) : null;
      },
      async list(): Promise<Meal[]> {
        const rows = await database.getAllAsync<MealRow>('SELECT * FROM meals ORDER BY sort_order, id');
        return rows.map(mapMeal);
      },
      async ensureDefaults(now = new Date().toISOString()): Promise<Meal[]> {
        await database.withTransactionAsync(async (transaction) => {
          for (const meal of DEFAULT_MEALS) {
            await transaction.runAsync(
              `INSERT OR IGNORE INTO meals (id, name, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)`,
              meal.id,
              meal.name,
              meal.sortOrder,
              now,
              now,
            );
          }
        });
        return this.list();
      },
      async delete(id: string): Promise<boolean> {
        const result = await database.runAsync('DELETE FROM meals WHERE id = ?', id);
        return result.changes > 0;
      },
    },
    foodLogEntries: {
      async save(input: FoodLogEntry): Promise<FoodLogEntry> {
        const entry = parseFoodLogEntry(input);
        const food = await database.getFirstAsync<FoodRow>(
          'SELECT * FROM foods WHERE id = ?',
          entry.foodId,
        );
        if (!food) throw new Error(`Cannot save food log entry: food ${entry.foodId} does not exist`);
        convertServingQuantity(entry.consumedQuantity, entry.consumedUnit, food.nutrition_basis_unit);
        await persistFoodLogEntry(database, entry);
        return entry;
      },
      async logFood(foodInput: Food, entryInput: FoodLogEntry): Promise<FoodLogEntry> {
        const food = parseFood(foodInput);
        const entry = parseFoodLogEntry(entryInput);
        if (entry.foodId !== food.id) {
          throw new TypeError('Food log entry foodId must match the saved food id');
        }
        convertServingQuantity(entry.consumedQuantity, entry.consumedUnit, food.nutritionBasis.unit);
        await database.withTransactionAsync(async (transaction) => {
          await persistFood(transaction, food);
          await persistFoodLogEntry(transaction, entry);
        });
        const saved = await this.getById(entry.id);
        if (!saved) throw new Error(`Saved food log entry ${entry.id} could not be read`);
        return saved;
      },
      async updateFoodLogEntry(foodInput: Food, entryInput: FoodLogEntry): Promise<FoodLogEntry> {
        const food = parseFood(foodInput);
        const entry = parseFoodLogEntry(entryInput);
        if (entry.foodId !== food.id) {
          throw new TypeError('Food log entry foodId must match the updated food id');
        }
        convertServingQuantity(entry.consumedQuantity, entry.consumedUnit, food.nutritionBasis.unit);
        await database.withTransactionAsync(async (transaction) => {
          const existing = await transaction.getFirstAsync<FoodLogEntryRow>(
            'SELECT * FROM food_log_entries WHERE id = ?',
            entry.id,
          );
          if (!existing) throw new Error(`Cannot edit food log entry ${entry.id}: it does not exist`);
          await persistFood(transaction, food);
          await persistFoodLogEntry(transaction, entry);
        });
        const saved = await this.getById(entry.id);
        if (!saved) throw new Error(`Updated food log entry ${entry.id} could not be read`);
        return saved;
      },
      async getById(id: string): Promise<FoodLogEntry | null> {
        const row = await database.getFirstAsync<FoodLogEntryRow>(
          'SELECT * FROM food_log_entries WHERE id = ?',
          id,
        );
        return row ? mapFoodLogEntry(row) : null;
      },
      async list(): Promise<FoodLogEntry[]> {
        const rows = await database.getAllAsync<FoodLogEntryRow>(
          'SELECT * FROM food_log_entries ORDER BY logged_at, id',
        );
        return rows.map(mapFoodLogEntry);
      },
      async listForDate(dateInput: string): Promise<FoodLogItem[]> {
        const date = parseLocalDate(dateInput, 'Food log date');
        const rows = await database.getAllAsync<
          FoodLogEntryRow & {
            meal_name: string;
            meal_sort_order: number;
            meal_created_at: string;
            meal_updated_at: string;
          }
        >(
          `SELECT entries.*, meals.name AS meal_name, meals.sort_order AS meal_sort_order,
                  meals.created_at AS meal_created_at, meals.updated_at AS meal_updated_at
           FROM food_log_entries AS entries
           JOIN meals ON meals.id = entries.meal_id
           WHERE entries.logged_date = ?
           ORDER BY meals.sort_order, entries.logged_at, entries.id`,
          date,
        );
        return Promise.all(
          rows.map(async (row) => {
            const foodRow = await database.getFirstAsync<FoodRow>(
              'SELECT * FROM foods WHERE id = ?',
              row.food_id,
            );
            if (!foodRow) throw new Error(`Food ${row.food_id} for entry ${row.id} is missing`);
            return {
              entry: mapFoodLogEntry(row),
              food: await mapFood(database, foodRow),
              meal: mapMeal({
                id: row.meal_id,
                name: row.meal_name,
                sort_order: row.meal_sort_order,
                created_at: row.meal_created_at,
                updated_at: row.meal_updated_at,
              }),
            };
          }),
        );
      },
      async deleteWithFood(id: string): Promise<boolean> {
        let deleted = false;
        await database.withTransactionAsync(async (transaction) => {
          const existing = await transaction.getFirstAsync<{ food_id: string }>(
            'SELECT food_id FROM food_log_entries WHERE id = ?',
            id,
          );
          if (!existing) return;
          await transaction.runAsync('DELETE FROM food_log_entries WHERE id = ?', id);
          const remaining = await transaction.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) AS count FROM food_log_entries WHERE food_id = ?',
            existing.food_id,
          );
          if (remaining?.count === 0) {
            await transaction.runAsync('DELETE FROM foods WHERE id = ?', existing.food_id);
          }
          deleted = true;
        });
        return deleted;
      },
      async delete(id: string): Promise<boolean> {
        const result = await database.runAsync('DELETE FROM food_log_entries WHERE id = ?', id);
        return result.changes > 0;
      },
    },
    dailyGoals: {
      async save(input: DailyGoal): Promise<DailyGoal> {
        const goal = parseDailyGoal(input);
        await database.runAsync(
          `INSERT INTO daily_goals (
            id, effective_date, calories_kcal, protein_g, carbohydrate_g, fat_g, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            effective_date = excluded.effective_date, calories_kcal = excluded.calories_kcal,
            protein_g = excluded.protein_g, carbohydrate_g = excluded.carbohydrate_g,
            fat_g = excluded.fat_g, updated_at = excluded.updated_at`,
          goal.id,
          goal.effectiveDate,
          goal.caloriesKcal,
          goal.proteinG,
          goal.carbohydrateG,
          goal.fatG,
          goal.createdAt,
          goal.updatedAt,
        );
        return goal;
      },
      async getForDate(date: string): Promise<DailyGoal | null> {
        const row = await database.getFirstAsync<DailyGoalRow>(
          'SELECT * FROM daily_goals WHERE effective_date = ?',
          date,
        );
        return row ? mapDailyGoal(row) : null;
      },
      async list(): Promise<DailyGoal[]> {
        const rows = await database.getAllAsync<DailyGoalRow>(
          'SELECT * FROM daily_goals ORDER BY effective_date, id',
        );
        return rows.map(mapDailyGoal);
      },
      async delete(id: string): Promise<boolean> {
        const result = await database.runAsync('DELETE FROM daily_goals WHERE id = ?', id);
        return result.changes > 0;
      },
    },
    weightMeasurements: {
      async save(input: WeightMeasurement): Promise<WeightMeasurement> {
        const measurement = parseWeightMeasurement(input);
        await database.runAsync(
          `INSERT INTO weight_measurements (id, quantity, unit, measured_at, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             quantity = excluded.quantity, unit = excluded.unit,
             measured_at = excluded.measured_at, note = excluded.note`,
          measurement.id,
          measurement.quantity,
          measurement.unit,
          measurement.measuredAt,
          measurement.note,
          measurement.createdAt,
        );
        return measurement;
      },
      async getById(id: string): Promise<WeightMeasurement | null> {
        const row = await database.getFirstAsync<WeightMeasurementRow>(
          'SELECT * FROM weight_measurements WHERE id = ?',
          id,
        );
        return row ? mapWeightMeasurement(row) : null;
      },
      async list(): Promise<WeightMeasurement[]> {
        const rows = await database.getAllAsync<WeightMeasurementRow>(
          'SELECT * FROM weight_measurements ORDER BY measured_at, id',
        );
        return rows.map(mapWeightMeasurement);
      },
      async delete(id: string): Promise<boolean> {
        const result = await database.runAsync('DELETE FROM weight_measurements WHERE id = ?', id);
        return result.changes > 0;
      },
    },
    settings: {
      async getOrCreate(now = new Date().toISOString()): Promise<AppSettings> {
        const existing = await database.getFirstAsync<AppSettingsRow>(
          "SELECT * FROM app_settings WHERE id = 'local'",
        );
        if (existing) return mapAppSettings(existing);
        await database.runAsync(
          'INSERT OR IGNORE INTO app_settings (id, preferred_weight_unit, created_at, updated_at) VALUES (?, ?, ?, ?)',
          'local',
          'kg',
          now,
          now,
        );
        const created = await database.getFirstAsync<AppSettingsRow>(
          "SELECT * FROM app_settings WHERE id = 'local'",
        );
        if (!created) throw new Error('Default local settings could not be created');
        return mapAppSettings(created);
      },
      async save(input: AppSettings): Promise<AppSettings> {
        const settings = parseAppSettings(input);
        await database.runAsync(
          `INSERT INTO app_settings (id, preferred_weight_unit, created_at, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             preferred_weight_unit = excluded.preferred_weight_unit,
             updated_at = excluded.updated_at`,
          settings.id,
          settings.preferredWeightUnit,
          settings.createdAt,
          settings.updatedAt,
        );
        const saved = await database.getFirstAsync<AppSettingsRow>(
          "SELECT * FROM app_settings WHERE id = 'local'",
        );
        if (!saved) throw new Error('Saved local settings could not be read');
        return mapAppSettings(saved);
      },
      async updateWeightUnit(unit: WeightUnit, now = new Date().toISOString()): Promise<AppSettings> {
        const current = await this.getOrCreate(now);
        return this.save({ ...current, preferredWeightUnit: unit, updatedAt: now });
      },
    },
  };
}
