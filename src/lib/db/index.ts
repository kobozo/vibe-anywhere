import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import postgres from 'postgres';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { getDatabaseConfig } from './config';

// Detect database backend
const dbConfig = getDatabaseConfig();

let db: ReturnType<typeof drizzlePostgres<typeof schema>>;
let queryClient: ReturnType<typeof postgres> | Database.Database | null = null;

// Initialize the database connection based on backend
// Note: We use the same schema (PostgreSQL) for both backends since it's now
// compatible with SQLite (text for JSON, integer for timestamps)
if (dbConfig.backend === 'postgresql') {
  console.log('Using PostgreSQL backend');

  // Create postgres connection with connection pooling
  queryClient = postgres(dbConfig.connectionString, {
    max: 20, // Maximum connections in pool
    idle_timeout: 20, // Close idle connections after 20 seconds
    connect_timeout: 10, // Connection timeout in seconds
  });

  db = drizzlePostgres(queryClient, { schema });
} else {
  console.log(`Using SQLite backend: ${dbConfig.sqlitePath}`);

  // Create SQLite connection with WAL mode for better concurrency
  queryClient = new Database(dbConfig.connectionString);

  // Enable WAL mode for better concurrent read performance
  queryClient.pragma('journal_mode = WAL');

  // Optimize SQLite settings for production
  queryClient.pragma('synchronous = NORMAL'); // Faster writes, still safe
  queryClient.pragma('cache_size = -64000'); // 64MB cache
  queryClient.pragma('temp_store = MEMORY'); // Store temp tables in memory
  queryClient.pragma('mmap_size = 30000000000'); // Memory-mapped I/O
  queryClient.pragma('foreign_keys = ON'); // Enforce foreign keys

  db = drizzleSqlite(queryClient, { schema }) as any;
}

// Export the database instance
export { db };

// Export database config
export { dbConfig };

// Export schema - now both PostgreSQL and SQLite schemas are compatible
// because PostgreSQL schema generates UUIDs in JavaScript (not SQL)
export * from './schema';

// Health check function
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    if (dbConfig.backend === 'postgresql' && queryClient && 'unsafe' in queryClient) {
      await queryClient`SELECT 1`;
    } else if (dbConfig.backend === 'sqlite' && queryClient && 'prepare' in queryClient) {
      queryClient.prepare('SELECT 1').get();
    }
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  if (queryClient) {
    if (dbConfig.backend === 'postgresql' && 'end' in queryClient) {
      await queryClient.end();
    } else if (dbConfig.backend === 'sqlite' && 'close' in queryClient) {
      queryClient.close();
    }
  }
}
