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

// Generate configuration based on detected backend
const config = backend === 'sqlite'
  ? defineConfig({
      schema: './src/lib/db/schema.sqlite.ts',
      out: './drizzle-sqlite',
      dialect: 'sqlite',
      dbCredentials: {
        url: process.env.DATABASE_URL?.replace('sqlite://', '').replace('file:', '')
          || resolve(process.cwd(), 'data', 'app.db'),
      },
      verbose: true,
      strict: true,
    })
  : defineConfig({
      schema: './src/lib/db/schema.ts', // PostgreSQL uses the original schema
      out: './drizzle-postgres',
      dialect: 'postgresql',
      dbCredentials: {
        url: process.env.DATABASE_URL || (() => {
          throw new Error('DATABASE_URL environment variable is required for PostgreSQL');
        })(),
      },
      verbose: true,
      strict: true,
    });

export default config;
