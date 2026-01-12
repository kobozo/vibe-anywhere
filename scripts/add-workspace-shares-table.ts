#!/usr/bin/env tsx
import Database from 'better-sqlite3';
import { resolve } from 'path';

// Manual migration to add workspace_shares table
// This is needed because drizzle-kit generates full schema migrations instead of incremental ones

const dbPath = resolve(process.cwd(), 'data', 'app.db');
console.log('🔄 Adding workspace_shares table...');
console.log(`   Database: ${dbPath}`);

const db = new Database(dbPath);

try {
  // Check if table already exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='workspace_shares'
  `).get();

  if (tableExists) {
    console.log('ℹ️  Table workspace_shares already exists. Skipping migration.');
    process.exit(0);
  }

  // Create workspace_shares table
  db.exec(`
    CREATE TABLE workspace_shares (
      id text PRIMARY KEY NOT NULL,
      workspace_id text NOT NULL,
      shared_with_user_id text NOT NULL,
      shared_by_user_id text NOT NULL,
      permissions text DEFAULT '["view","execute"]' NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (shared_with_user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (shared_by_user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
    );
  `);

  // Create unique constraint index
  db.exec(`
    CREATE UNIQUE INDEX unique_workspace_share ON workspace_shares (workspace_id, shared_with_user_id);
  `);

  console.log('✅ Successfully created workspace_shares table');

  // Verify table structure
  const tableInfo = db.prepare('PRAGMA table_info(workspace_shares)').all();
  console.log('\n📋 Table structure:');
  tableInfo.forEach((col: any) => {
    console.log(`   - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
  });

  // Verify constraints
  const foreignKeys = db.prepare('PRAGMA foreign_key_list(workspace_shares)').all();
  console.log('\n🔗 Foreign keys:');
  foreignKeys.forEach((fk: any) => {
    console.log(`   - ${fk.from} → ${fk.table}(${fk.to}) [ON DELETE ${fk.on_delete}]`);
  });

  // Verify unique constraint
  const indexes = db.prepare(`
    SELECT name, sql FROM sqlite_master
    WHERE type='index' AND tbl_name='workspace_shares'
  `).all();
  console.log('\n🔑 Indexes:');
  indexes.forEach((idx: any) => {
    console.log(`   - ${idx.name}`);
  });

} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}
