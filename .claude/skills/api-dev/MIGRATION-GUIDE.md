# Database Migration Guide

## Workflow
1. Edit `src/lib/db/schema.ts`
2. Run `npm run db:generate` (creates migration)
3. Review generated SQL in `drizzle/`
4. Run `npm run db:migrate` (applies migration)
5. Commit migration files

## Example
```bash
# Add column to schema.ts
priority: integer('priority').default(0).notNull(),

# Generate migration
npm run db:generate
# Creates drizzle/0001_add_priority.sql

# Review
cat drizzle/0001_add_priority.sql

# Apply
npm run db:migrate

# Commit
git add src/lib/db/schema.ts drizzle/0001_*.sql
git commit -m "feat: add priority field"
```

## NEVER use db:push
It bypasses migrations and can cause data loss!
