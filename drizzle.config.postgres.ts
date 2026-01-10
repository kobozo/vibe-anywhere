import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle-postgres',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://sessionhub:sessionhub_dev_password@localhost:5432/sessionhub',
  },
  verbose: true,
  strict: true,
});
