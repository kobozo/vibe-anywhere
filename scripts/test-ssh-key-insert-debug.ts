import { db, sshKeys } from '../src/lib/db';

async function testInsert() {
  try {
    console.log('Testing SSH key insert with different values...');

    const testPublicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH test@example.com';
    const testPrivateKey = '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----\n';
    const encryptedPrivateKey = Buffer.from(testPrivateKey).toString('base64');

    // Test 1: Try with isDefault converted to integer
    console.log('\n--- Test 1: isDefault as integer (0) ---');
    const result1 = await db
      .insert(sshKeys)
      .values({
        userId: '00000000-0000-0000-0000-000000000001',
        name: 'test-key-1',
        publicKey: testPublicKey,
        privateKeyEncrypted: encryptedPrivateKey,
        keyType: 'ed25519',
        fingerprint: 'SHA256:test1',
        isDefault: 0 as any, // Force integer
      })
      .returning();

    console.log('✅ Test 1 successful:', result1);

    // Test 2: Try with isDefault as boolean
    console.log('\n--- Test 2: isDefault as boolean (false) ---');
    try {
      const result2 = await db
        .insert(sshKeys)
        .values({
          userId: '00000000-0000-0000-0000-000000000001',
          name: 'test-key-2',
          publicKey: testPublicKey,
          privateKeyEncrypted: encryptedPrivateKey,
          keyType: 'ed25519',
          fingerprint: 'SHA256:test2',
          isDefault: false, // Boolean
        })
        .returning();

      console.log('✅ Test 2 successful:', result2);
    } catch (e) {
      console.error('❌ Test 2 failed:', e.message);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

testInsert();
