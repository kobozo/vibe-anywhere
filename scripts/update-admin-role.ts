#!/usr/bin/env tsx

/**
 * Migration: Set Existing Admin User to Admin Role
 *
 * Updates the default 'admin' user to have role='admin'.
 * Handles case where admin user doesn't exist (no error).
 */

import Database from 'better-sqlite3';
import { resolve } from 'path';

const dbPath = resolve(process.cwd(), 'data', 'app.db');

console.log('🔄 Migration: Update admin user to admin role');
console.log(`Database: ${dbPath}`);

const db = new Database(dbPath);

try {
  // Check if admin user exists
  const adminUser = db.prepare('SELECT id, username, role FROM users WHERE username = ?').get('admin');

  if (!adminUser) {
    console.log('ℹ️  Admin user not found - skipping migration (no error)');
    db.close();
    process.exit(0);
  }

  console.log(`Found admin user: ${JSON.stringify(adminUser)}`);

  // Update admin user to admin role
  const result = db.prepare('UPDATE users SET role = ? WHERE username = ?').run('admin', 'admin');

  if (result.changes > 0) {
    console.log('✅ Admin user updated to admin role');

    // Verify the update
    const updatedUser = db.prepare('SELECT id, username, role FROM users WHERE username = ?').get('admin');
    console.log(`Updated user: ${JSON.stringify(updatedUser)}`);
  } else {
    console.log('⚠️  No changes made (user may already have admin role)');
  }

  db.close();
  console.log('✅ Migration completed successfully');
} catch (error) {
  console.error('❌ Migration failed:', error);
  db.close();
  process.exit(1);
}
