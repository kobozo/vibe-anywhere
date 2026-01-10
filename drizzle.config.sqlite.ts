import { defineConfig } from 'drizzle-kit';
import { resolve } from 'path';

// Default SQLite path
const sqlitePath = process.env.DATABASE_URL?.replace('sqlite://', '').replace('file:', '')
  || resolve(process.cwd(), 'data', 'app.db');

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle-sqlite',
  dialect: 'sqlite',
  dbCredentials: {
    url: sqlitePath,
  },
  verbose: true,
  strict: true,
});
