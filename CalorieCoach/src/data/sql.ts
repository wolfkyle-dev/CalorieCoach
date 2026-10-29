export type SqlValue = string | number | null | Uint8Array;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlExecutor {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlValue[]): Promise<SqlRunResult>;
  getFirstAsync<T>(source: string, ...params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: SqlValue[]): Promise<T[]>;
}

export interface AppDatabase extends SqlExecutor {
  withTransactionAsync(task: (transaction: SqlExecutor) => Promise<void>): Promise<void>;
}
