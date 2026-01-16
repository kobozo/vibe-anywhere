import { db, sshKeys } from '../src/lib/db';
import crypto from 'crypto';

async function testInsert() {
  try {
    console.log('Testing SSH key insert...');

    // Generate a test ed25519 key
    const testPublicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH test@example.com';
    const testPrivateKey = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\nQyNTUxOQAAACB6test\n-----END OPENSSH PRIVATE KEY-----\n';
    const encryptedPrivateKey = Buffer.from(testPrivateKey).toString('base64'); // Simplified encryption

    const result = await db
      .insert(sshKeys)
      .values({
        userId: '00000000-0000-0000-0000-000000000001', // Test user ID
        name: 'test-key',
        publicKey: testPublicKey,
        privateKeyEncrypted: encryptedPrivateKey,
        keyType: 'ed25519',
        fingerprint: 'SHA256:test',
        isDefault: false,
      })
      .returning();

    console.log('✅ Insert successful:', result);
  } catch (error) {
    console.error('❌ Insert failed:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.cause) {
      console.error('Error cause:', error.cause);
    }
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  } finally {
    process.exit(0);
  }
}

testInsert();
