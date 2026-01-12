import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator';
import postgres from 'postgres';
import Database from 'better-sqlite3';
import { getDatabaseConfig } from './config';

/**
 * Run database migrations for the configured backend.
 * This function can be called from server startup or as a standalone script.
 */
export async function runMigrations() {
  const dbConfig = getDatabaseConfig();

  console.log(`Running migrations for ${dbConfig.backend} backend...`);

  if (dbConfig.backend === 'postgresql') {
    // PostgreSQL migrations
    const migrationClient = postgres(dbConfig.connectionString, { max: 1 });
    const db = drizzlePostgres(migrationClient);

    await migratePostgres(db, { migrationsFolder: './drizzle-postgres' });

    console.log('PostgreSQL migrations complete!');

    await migrationClient.end();
  } else {
    // SQLite migrations
    const migrationClient = new Database(dbConfig.connectionString);

    // Enable WAL mode before migrations
    migrationClient.pragma('journal_mode = WAL');

    const db = drizzleSqlite(migrationClient);

    migrateSqlite(db, { migrationsFolder: './drizzle-sqlite' });

    console.log('SQLite migrations complete!');

    migrationClient.close();
  }
}

// When run as a standalone script (ES module detection)
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMainModule) {
  runMigrations()
    .then(() => {
      console.log('Migrations completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
