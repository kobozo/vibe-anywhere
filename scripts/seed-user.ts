/**
 * Seed script to create an initial admin user
 * Usage: npx tsx scripts/seed-user.ts [username] [password]
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import postgres from 'postgres';
import { v4 as uuidv4 } from 'uuid';

const SALT_ROUNDS = 12;

async function seedUser() {
  const username = process.argv[2] || 'admin';
  const password = process.argv[3] || 'admin123';

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

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
    const token = `sh_${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`;

    await sql`
      INSERT INTO users (id, username, password_hash, token, created_at, updated_at)
      VALUES (${uuidv4()}, ${username}, ${passwordHash}, ${token}, NOW(), NOW())
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

seedUser();
