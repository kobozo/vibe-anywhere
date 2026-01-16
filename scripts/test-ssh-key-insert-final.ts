import { db, sshKeys, users } from '../src/lib/db';
import { eq } from 'drizzle-orm';

async function testInsert() {
  try {
    console.log('Testing SSH key insert...');

    // Find first user in database
    const [user] = await db.select().from(users).limit(1);
    if (!user) {
      console.error('❌ No users in database. Please create a user first.');
      process.exit(1);
    }
    console.log('Using user:', user.username);

    const testPublicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH test@example.com';
    const testPrivateKey = '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----\n';
    const encryptedPrivateKey = Buffer.from(testPrivateKey).toString('base64');

    // Test with isDefault as boolean (false)
    console.log('\n--- Inserting with isDefault as boolean ---');
    try {
      const result = await db
        .insert(sshKeys)
        .values({
          userId: user.id,
          name: 'test-key-boolean',
          publicKey: testPublicKey,
          privateKeyEncrypted: encryptedPrivateKey,
          keyType: 'ed25519',
          fingerprint: 'SHA256:test-boolean',
          isDefault: false, // Boolean
        })
        .returning();

      console.log('✅ Boolean insert successful:', result);
    } catch (e) {
      console.error('❌ Boolean insert failed:', e.message);
    }

    // Test with isDefault as integer (0)
    console.log('\n--- Inserting with isDefault as integer ---');
    try {
      const result = await db
        .insert(sshKeys)
        .values({
          userId: user.id,
          name: 'test-key-integer',
          publicKey: testPublicKey,
          privateKeyEncrypted: encryptedPrivateKey,
          keyType: 'ed25519',
          fingerprint: 'SHA256:test-integer',
          isDefault: 0 as any, // Integer
        })
        .returning();

      console.log('✅ Integer insert successful:', result);
    } catch (e) {
      console.error('❌ Integer insert failed:', e.message);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

testInsert();
