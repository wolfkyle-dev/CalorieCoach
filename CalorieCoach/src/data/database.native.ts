import * as SQLite from 'expo-sqlite';

import { migrateDatabase } from './migrations.ts';
import type { AppDatabase, SqlExecutor, SqlRunResult, SqlValue } from './sql.ts';

const DATABASE_NAME = 'caloriecoach.db';

class ExpoDatabaseAdapter implements AppDatabase {
  constructor(private readonly database: SQLite.SQLiteDatabase) {}

  execAsync(source: string): Promise<void> {
    return this.database.execAsync(source);
  }

  runAsync(source: string, ...params: SqlValue[]): Promise<SqlRunResult> {
    return this.database.runAsync(source, ...params);
  }

  getFirstAsync<T>(source: string, ...params: SqlValue[]): Promise<T | null> {
    return this.database.getFirstAsync<T>(source, ...params);
  }

  getAllAsync<T>(source: string, ...params: SqlValue[]): Promise<T[]> {
    return this.database.getAllAsync<T>(source, ...params);
  }

  withTransactionAsync(task: (transaction: SqlExecutor) => Promise<void>): Promise<void> {
    return this.database.withExclusiveTransactionAsync((transaction) => task(transaction));
  }
}

let databasePromise: Promise<AppDatabase> | null = null;

export async function getDatabase(): Promise<AppDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
      try {
        await database.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
        const adapter = new ExpoDatabaseAdapter(database);
        await migrateDatabase(adapter);
        return adapter;
      } catch (error) {
        await database.closeAsync();
        throw error;
      }
    })();
  }

  try {
    return await databasePromise;
  } catch (error) {
    databasePromise = null;
    throw error;
  }
}
