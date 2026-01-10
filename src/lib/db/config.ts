import { resolve, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

export type DatabaseBackend = 'postgresql' | 'sqlite';

export interface DatabaseConfig {
  backend: DatabaseBackend;
  connectionString: string;
  sqlitePath?: string;
}

/**
 * Detects database backend based on DATABASE_URL environment variable
 *
 * Detection rules:
 * - Starts with "postgresql://" or "postgres://" → PostgreSQL
 * - Starts with "sqlite://", "file:", or is a file path → SQLite
 * - Empty/undefined → SQLite with default path ./data/app.db
 */
export function detectDatabaseBackend(): DatabaseConfig {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  // Empty or undefined → default to SQLite
  if (!databaseUrl) {
    const defaultPath = resolve(process.cwd(), 'data', 'app.db');
    ensureDirectoryExists(dirname(defaultPath));

    return {
      backend: 'sqlite',
      connectionString: defaultPath,
      sqlitePath: defaultPath,
    };
  }

  // PostgreSQL detection
  if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
    return {
      backend: 'postgresql',
      connectionString: databaseUrl,
    };
  }

  // SQLite with sqlite:// protocol
  if (databaseUrl.startsWith('sqlite://')) {
    const sqlitePath = resolve(process.cwd(), databaseUrl.replace('sqlite://', ''));
    ensureDirectoryExists(dirname(sqlitePath));

    return {
      backend: 'sqlite',
      connectionString: sqlitePath,
      sqlitePath,
    };
  }

  // SQLite with file: protocol
  if (databaseUrl.startsWith('file:')) {
    const sqlitePath = resolve(process.cwd(), databaseUrl.replace('file:', ''));
    ensureDirectoryExists(dirname(sqlitePath));

    return {
      backend: 'sqlite',
      connectionString: sqlitePath,
      sqlitePath,
    };
  }

  // Assume it's a file path → SQLite
  const sqlitePath = resolve(process.cwd(), databaseUrl);
  ensureDirectoryExists(dirname(sqlitePath));

  return {
    backend: 'sqlite',
    connectionString: sqlitePath,
    sqlitePath,
  };
}

/**
 * Ensures the directory for a file path exists
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get the database configuration with backend detection
 */
export function getDatabaseConfig(): DatabaseConfig {
  return detectDatabaseBackend();
}
