import type { AppDatabase } from './sql.ts';

export async function getDatabase(): Promise<AppDatabase> {
  throw new Error(
    'Local SQLite storage is currently available on iOS and Android only; web persistence requires SQLite WebAssembly configuration.',
  );
}
