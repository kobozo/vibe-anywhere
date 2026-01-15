import Database from 'better-sqlite3';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const dbPath = resolve(process.cwd(), 'data/app.db');
const sqlPath = resolve(process.cwd(), 'drizzle-sqlite/0012_seed_tab_templates.sql');

console.log('Database path:', dbPath);
console.log('SQL file:', sqlPath);

const db = new Database(dbPath);
const sql = readFileSync(sqlPath, 'utf-8');

console.log('\nExecuting seed migration...');
try {
  db.exec(sql);
  console.log('✓ Tab templates seeded successfully!');

  // Verify
  const count = db.prepare("SELECT COUNT(*) as count FROM tab_templates").get() as any;
  console.log(`\nVerification: ${count.count} templates now exist in database`);

  // Show templates
  const templates = db.prepare("SELECT name, command, required_tech_stack FROM tab_templates ORDER BY sort_order").all() as any[];
  console.log('\nTemplates:');
  templates.forEach((t, i) => {
    const techStack = t.required_tech_stack ? ` (requires: ${t.required_tech_stack})` : '';
    console.log(`${i + 1}. ${t.name} - ${t.command}${techStack}`);
  });
} catch (e: any) {
  console.error('Error:', e.message);
  process.exit(1);
} finally {
  db.close();
}
