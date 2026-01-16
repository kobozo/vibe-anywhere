import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'app.db');
const db = new Database(dbPath);

// List all tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
console.log('Tables:', tables.map(t => t.name).join(', '));

// Check if ssh_keys table exists
if (tables.some(t => t.name === 'ssh_keys')) {
  console.log('\nssh_keys table schema:');
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ssh_keys'").get() as { sql: string };
  console.log(schema.sql);

  // Check row count
  const count = db.prepare("SELECT COUNT(*) as count FROM ssh_keys").get() as { count: number };
  console.log(`\nRows in ssh_keys: ${count.count}`);
} else {
  console.log('\n❌ ssh_keys table does NOT exist!');
}

db.close();
