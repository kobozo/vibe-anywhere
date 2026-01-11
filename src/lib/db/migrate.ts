import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator';
import postgres from 'postgres';
import Database from 'better-sqlite3';
import { getDatabaseConfig } from './config';

async function runMigrations() {
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

  process.exit(0);
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
