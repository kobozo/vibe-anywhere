#!/usr/bin/env tsx
import Database from 'better-sqlite3';
import { resolve } from 'path';

const dbPath = resolve(process.cwd(), 'data', 'app.db');
const db = new Database(dbPath);

try {
  // Add role column to users table
  console.log('Adding role column to users table...');
  db.exec(`
    ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'developer' NOT NULL;
  `);
  console.log('✓ Role column added successfully');

  // Verify the column was added
  const columns = db.prepare("PRAGMA table_info(users)").all();
  const roleColumn = columns.find((col: any) => col.name === 'role');

  if (roleColumn) {
    console.log('✓ Verified: role column exists in users table');
    console.log(`  - Type: ${roleColumn.type}`);
    console.log(`  - Default: ${roleColumn.dflt_value}`);
    console.log(`  - NotNull: ${roleColumn.notnull}`);
  } else {
    console.error('✗ Error: role column not found after adding');
    process.exit(1);
  }
} catch (error: any) {
  if (error.message.includes('duplicate column name')) {
    console.log('✓ Role column already exists');
  } else {
    console.error('Error adding role column:', error);
    process.exit(1);
  }
} finally {
  db.close();
}
