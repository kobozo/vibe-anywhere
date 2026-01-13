import Database from 'better-sqlite3';
import { resolve } from 'path';

const dbPath = resolve(process.cwd(), 'data', 'app.db');
const db = new Database(dbPath);

const user = db.prepare('SELECT username, force_password_change, token, role FROM users WHERE username = ?').get('admin');
console.log('Admin user state:');
console.log(JSON.stringify(user, null, 2));
console.log('\nExpected: force_password_change should be 1 (true)');
console.log('Actual: force_password_change is', user ? (user as any).force_password_change : 'N/A');

db.close();
