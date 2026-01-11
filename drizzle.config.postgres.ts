import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
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
