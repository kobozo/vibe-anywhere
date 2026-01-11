/**
 * Test authentication with both backends
 * Usage: npx tsx scripts/test-auth.ts [username] [password]
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { db, dbConfig } from '../src/lib/db';
import { users } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

async function testAuth() {
  const username = process.argv[2] || 'testuser';
  const password = process.argv[3] || 'testpass123';

  console.log(`Testing authentication with ${dbConfig.backend} backend`);

  try {
    // Find user
    const userList = await db.select().from(users).where(eq(users.username, username));

    if (userList.length === 0) {
      console.error(`User '${username}' not found`);
      process.exit(1);
    }

    const user = userList[0];

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      console.error('Password does not match');
      process.exit(1);
    }

    console.log('✓ Authentication successful');
    console.log(`User ID: ${user.id}`);
    console.log(`Username: ${user.username}`);
    console.log(`Token: ${user.token}`);
  } catch (error) {
    console.error('Authentication test failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

testAuth();
