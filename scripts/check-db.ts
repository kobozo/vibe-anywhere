import Database from 'better-sqlite3';
import { resolve } from 'path';

const dbPath = resolve(process.cwd(), 'data/app.db');
console.log('Database path:', dbPath);

const db = new Database(dbPath);

console.log('\n=== Tables ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
tables.forEach((t: any) => console.log(t.name));

console.log('\n=== tab_templates count ===');
try {
  const count = db.prepare("SELECT COUNT(*) as count FROM tab_templates").get() as any;
  console.log('Records:', count.count);

  if (count.count > 0) {
    console.log('\n=== tab_templates data ===');
    const templates = db.prepare("SELECT * FROM tab_templates LIMIT 10").all();
    console.log(JSON.stringify(templates, null, 2));
  }
} catch (e: any) {
  console.log('Error:', e.message);
}

console.log('\n=== users table ===');
try {
  const users = db.prepare("SELECT id, username FROM users").all();
  console.log('Users:', JSON.stringify(users, null, 2));
} catch (e: any) {
  console.log('Error:', e.message);
}

console.log('\n=== migrations applied ===');
try {
  const migrations = db.prepare("SELECT * FROM __drizzle_migrations ORDER BY created_at").all() as any[];
  console.log('Migrations count:', migrations.length);
  migrations.forEach(m => console.log(`  - ${m.hash.substring(0, 50)}...`));
} catch (e: any) {
  console.log('No migrations table or error:', e.message);
}

db.close();
