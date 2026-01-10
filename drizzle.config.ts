import { defineConfig } from 'drizzle-kit';
import { resolve } from 'path';

// Detect database backend from DATABASE_URL
function detectBackend(): 'postgresql' | 'sqlite' {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return 'sqlite'; // Default to SQLite
  }

  if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
    return 'postgresql';
  }

  return 'sqlite';
}

const backend = detectBackend();

// SQLite configuration
if (backend === 'sqlite') {
  const sqlitePath = process.env.DATABASE_URL?.replace('sqlite://', '').replace('file:', '')
    || resolve(process.cwd(), 'data', 'app.db');

  module.exports = defineConfig({
    schema: './src/lib/db/schema.sqlite.ts',
    out: './drizzle-sqlite',
    dialect: 'sqlite',
    dbCredentials: {
      url: sqlitePath,
    },
    verbose: true,
    strict: true,
  });
} else {
  // PostgreSQL configuration
  module.exports = defineConfig({
    schema: './src/lib/db/schema.ts', // PostgreSQL uses the original schema
    out: './drizzle-postgres',
    dialect: 'postgresql',
    dbCredentials: {
      url: process.env.DATABASE_URL || 'postgresql://sessionhub:sessionhub_dev_password@localhost:5432/sessionhub',
    },
    verbose: true,
    strict: true,
  });
}
