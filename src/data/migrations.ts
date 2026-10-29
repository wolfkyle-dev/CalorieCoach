import type { AppDatabase, SqlExecutor } from './sql.ts';

export const LATEST_SCHEMA_VERSION = 3;

interface Migration {
  version: number;
  up(database: SqlExecutor): Promise<void>;
}

export const schemaMigrations: readonly Migration[] = [
  {
    version: 1,
    async up(database) {
      await database.execAsync(`
        CREATE TABLE foods (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0),
          brand TEXT,
          serving_quantity REAL NOT NULL CHECK (serving_quantity > 0),
          serving_unit TEXT NOT NULL CHECK (serving_unit IN ('g', 'kg', 'oz', 'ml', 'l', 'serving')),
          nutrition_basis_quantity REAL NOT NULL CHECK (nutrition_basis_quantity > 0),
          nutrition_basis_unit TEXT NOT NULL CHECK (nutrition_basis_unit IN ('g', 'kg', 'oz', 'ml', 'l', 'serving')),
          source TEXT NOT NULL CHECK (source IN ('user_entered', 'verified', 'estimated')),
          source_details TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE food_nutrients (
          food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
          nutrient TEXT NOT NULL CHECK (nutrient IN ('energy', 'protein', 'carbohydrate', 'fat', 'fiber', 'sodium')),
          quantity REAL NOT NULL CHECK (quantity >= 0),
          unit TEXT NOT NULL CHECK (unit IN ('kcal', 'g', 'mg')),
          PRIMARY KEY (food_id, nutrient)
        );

        CREATE TABLE meals (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0),
          sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE food_log_entries (
          id TEXT PRIMARY KEY NOT NULL,
          food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE RESTRICT,
          meal_id TEXT NOT NULL REFERENCES meals(id) ON DELETE RESTRICT,
          consumed_quantity REAL NOT NULL CHECK (consumed_quantity > 0),
          consumed_unit TEXT NOT NULL CHECK (consumed_unit IN ('g', 'kg', 'oz', 'ml', 'l', 'serving')),
          logged_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX food_log_entries_logged_at_idx ON food_log_entries(logged_at);

        CREATE TABLE daily_goals (
          id TEXT PRIMARY KEY NOT NULL,
          effective_date TEXT NOT NULL UNIQUE,
          calories_kcal REAL CHECK (calories_kcal IS NULL OR calories_kcal >= 0),
          protein_g REAL CHECK (protein_g IS NULL OR protein_g >= 0),
          carbohydrate_g REAL CHECK (carbohydrate_g IS NULL OR carbohydrate_g >= 0),
          fat_g REAL CHECK (fat_g IS NULL OR fat_g >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE weight_measurements (
          id TEXT PRIMARY KEY NOT NULL,
          quantity REAL NOT NULL CHECK (quantity > 0),
          unit TEXT NOT NULL CHECK (unit IN ('kg', 'lb')),
          measured_at TEXT NOT NULL,
          note TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX weight_measurements_measured_at_idx ON weight_measurements(measured_at);
      `);
    },
  },
  {
    version: 2,
    async up(database) {
      await database.execAsync(`
        CREATE TABLE app_settings (
          id TEXT PRIMARY KEY NOT NULL CHECK (id = 'local'),
          preferred_weight_unit TEXT NOT NULL CHECK (preferred_weight_unit IN ('kg', 'lb')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 3,
    async up(database) {
      await database.execAsync(`
        ALTER TABLE food_log_entries
          ADD COLUMN logged_date TEXT NOT NULL DEFAULT '1970-01-01'
          CHECK (logged_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
        UPDATE food_log_entries SET logged_date = substr(logged_at, 1, 10);
        CREATE INDEX food_log_entries_logged_date_idx ON food_log_entries(logged_date, logged_at, id);
      `);
    },
  },
];

export async function migrateDatabase(database: AppDatabase): Promise<void> {
  const versionRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = versionRow?.user_version ?? 0;
  if (currentVersion > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported version ${LATEST_SCHEMA_VERSION}`,
    );
  }

  for (const migration of schemaMigrations) {
    if (migration.version <= currentVersion) continue;
    await database.withTransactionAsync(async (transaction) => {
      await migration.up(transaction);
      await transaction.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
    currentVersion = migration.version;
  }
}
