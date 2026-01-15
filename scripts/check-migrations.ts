import Database from 'better-sqlite3';
import { resolve } from 'path';

const dbPath = resolve(process.cwd(), 'data/app.db');
const db = new Database(dbPath);

console.log('=== Applied Migrations ===');
try {
  const migrations = db.prepare("SELECT * FROM __drizzle_migrations ORDER BY created_at").all() as any[];
  console.log('Total migrations:', migrations.length);
  console.log('\nMigrations:');
  migrations.forEach((m, i) => {
    console.log(`${i + 1}. Hash: ${m.hash.substring(0, 20)}...`);
    console.log(`   Created: ${new Date(m.created_at).toISOString()}`);
  });
} catch (e: any) {
  console.log('Error:', e.message);
}

console.log('\n=== Migration Files in drizzle-sqlite/ ===');
const fs = require('fs');
const path = require('path');
const migrationDir = resolve(process.cwd(), 'drizzle-sqlite');
const files = fs.readdirSync(migrationDir).filter((f: string) => f.endsWith('.sql')).sort();
console.log('Total SQL files:', files.length);
files.forEach((f: string, i: number) => {
  console.log(`${i + 1}. ${f}`);
});

db.close();
