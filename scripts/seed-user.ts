/**
 * Seed script to create an initial admin user
 * Usage: npx tsx scripts/seed-user.ts [username] [password]
 *
 * Supports both PostgreSQL and SQLite backends
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import postgres from 'postgres';
import Database from 'better-sqlite3';
import { getDatabaseConfig } from '../src/lib/db/config';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

async function seedUser() {
  const username = process.argv[2] || 'admin';
  const password = process.argv[3] || 'admin123';

  const dbConfig = getDatabaseConfig();

  console.log(`Using ${dbConfig.backend} backend`);

  if (dbConfig.backend === 'postgresql') {
    await seedUserPostgres(username, password, dbConfig.connectionString);
  } else {
    seedUserSqlite(username, password, dbConfig.connectionString);
  }
}

async function seedUserPostgres(username: string, password: string, connectionString: string) {
  const sql = postgres(connectionString);

  try {
    // Check if user already exists
    const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
    if (existing.length > 0) {
      console.log(`User '${username}' already exists`);
      await sql.end();
      return;
    }

    // Create user
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const token = `sh_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;

    await sql`
      INSERT INTO users (id, username, password_hash, token, created_at, updated_at)
      VALUES (${crypto.randomUUID()}, ${username}, ${passwordHash}, ${token}, NOW(), NOW())
    `;

    console.log(`Created user '${username}'`);
    console.log(`Password: ${password}`);
    console.log(`Token: ${token}`);
  } catch (error) {
    console.error('Failed to create user:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

function seedUserSqlite(username: string, password: string, dbPath: string) {
  const db = new Database(dbPath);

  try {
    // Check if user already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      console.log(`User '${username}' already exists`);
      db.close();
      return;
    }

    // Create user
    const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
    const token = `sh_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO users (id, username, password_hash, token, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(crypto.randomUUID(), username, passwordHash, token, now, now);

    console.log(`Created user '${username}'`);
    console.log(`Password: ${password}`);
    console.log(`Token: ${token}`);
  } catch (error) {
    console.error('Failed to create user:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

seedUser();
