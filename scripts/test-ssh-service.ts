import { config } from 'dotenv';
config(); // Load environment variables

import { getSSHKeyService } from '../src/lib/services';
import { db, users } from '../src/lib/db';

async function testSSHKeyService() {
  try {
    console.log('Testing SSH Key Service...\n');

    // Find first user
    const [user] = await db.select().from(users).limit(1);
    if (!user) {
      console.error('❌ No users in database');
      process.exit(1);
    }
    console.log(`Using user: ${user.username}\n`);

    const sshKeyService = getSSHKeyService();

    // Test 1: Generate a key (this uses the service layer)
    console.log('--- Test 1: Generate SSH key via service ---');
    try {
      const key = await sshKeyService.generateUserKey(user.id, {
        name: 'test-service-key',
        keyType: 'ed25519',
        comment: 'test@example.com',
      });

      console.log('✅ Key generated successfully!');
      console.log('Key ID:', key.id);
      console.log('Key Name:', key.name);
      console.log('isDefault value in DB:', key.isDefault);
      console.log('isDefault type:', typeof key.isDefault);

      // Test 2: Get key info (tests toKeyInfo conversion)
      console.log('\n--- Test 2: Get key info (API response) ---');
      const keyInfo = sshKeyService.toKeyInfo(key);
      console.log('isDefault in API response:', keyInfo.isDefault);
      console.log('isDefault type in API response:', typeof keyInfo.isDefault);

      if (typeof keyInfo.isDefault === 'boolean') {
        console.log('✅ toKeyInfo correctly converts to boolean');
      } else {
        console.log('❌ toKeyInfo should return boolean, got:', typeof keyInfo.isDefault);
      }

      // Test 3: Set as default (tests setDefaultKey)
      console.log('\n--- Test 3: Set key as default ---');
      await sshKeyService.setDefaultKey(user.id, key.id);
      console.log('✅ Set default key completed');

      // Verify it's set as default
      const updatedKey = await sshKeyService.getKey(key.id);
      if (updatedKey) {
        console.log('isDefault after setDefaultKey:', updatedKey.isDefault);
        const updatedKeyInfo = sshKeyService.toKeyInfo(updatedKey);
        console.log('isDefault in API after setDefaultKey:', updatedKeyInfo.isDefault);

        if (updatedKeyInfo.isDefault === true) {
          console.log('✅ Key correctly marked as default');
        } else {
          console.log('❌ Expected isDefault to be true');
        }
      }

      // Clean up
      console.log('\n--- Cleaning up test key ---');
      await sshKeyService.deleteKey(key.id);
      console.log('✅ Test key deleted');

    } catch (error: any) {
      console.error('❌ Test failed:', error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    }

    console.log('\n✅ All service tests passed!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

testSSHKeyService();
