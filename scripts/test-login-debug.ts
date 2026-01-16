import { getAuthService } from '../src/lib/services';
import { db, users } from '../src/lib/db';
import { eq } from 'drizzle-orm';

async function testLogin() {
  console.log('Testing login...');

  try {
    // First, check if the user exists in the database
    console.log('\n1. Checking user in database...');
    const [user] = await db.select().from(users).where(eq(users.username, 'admin'));

    if (!user) {
      console.error('❌ Admin user not found in database!');
      return;
    }

    console.log('✅ Admin user found:');
    console.log('   - ID:', user.id);
    console.log('   - Username:', user.username);
    console.log('   - Role:', user.role);
    console.log('   - Status:', user.status);
    console.log('   - Password hash:', user.passwordHash);
    console.log('   - Force password change:', user.forcePasswordChange);
    console.log('   - Created at type:', typeof user.createdAt, user.createdAt);
    console.log('   - Updated at type:', typeof user.updatedAt, user.updatedAt);

    // Test the login
    console.log('\n2. Testing login with auth service...');
    const authService = getAuthService();

    try {
      const result = await authService.login('admin', 'vibe-anywhere');
      console.log('✅ Login successful!');
      console.log('   - Token:', result.token);
      console.log('   - Force password change:', result.forcePasswordChange);
      console.log('   - User:', result.user);
    } catch (error) {
      console.error('❌ Login failed:', error instanceof Error ? error.message : error);
      throw error;
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

testLogin();
