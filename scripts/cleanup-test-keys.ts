import { config } from 'dotenv';
config();

import { db, sshKeys } from '../src/lib/db';
import { like } from 'drizzle-orm';

async function cleanupTestKeys() {
  try {
    console.log('Cleaning up test SSH keys...\n');

    // Find all test keys
    const testKeys = await db
      .select()
      .from(sshKeys)
      .where(like(sshKeys.name, 'test-%'));

    console.log(`Found ${testKeys.length} test keys`);

    if (testKeys.length > 0) {
      for (const key of testKeys) {
        console.log(`- ${key.name} (${key.id})`);
      }

      // Delete all test keys
      const result = await db
        .delete(sshKeys)
        .where(like(sshKeys.name, 'test-%'));

      console.log(`\n✅ Deleted ${testKeys.length} test keys`);
    } else {
      console.log('No test keys to clean up');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

cleanupTestKeys();
