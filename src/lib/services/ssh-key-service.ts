import { eq, and, or, isNull } from 'drizzle-orm';
import { db, queryClient } from '@/lib/db';
import { sshKeys, type SSHKey, type NewSSHKey, type SSHKeyType } from '@/lib/db/schema';
import { config } from '@/lib/config';
import type Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

export interface GenerateKeyInput {
  name: string;
  keyType?: SSHKeyType;
  comment?: string;
}

export interface AddKeyInput {
  name: string;
  publicKey: string;
  privateKey: string;
  keyType?: SSHKeyType;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}

// Algorithm for encryption (AES-256-GCM)
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * SSH Key Service
 *
 * Manages SSH keys for Git authentication. Keys are stored encrypted in the database
 * using AES-256-GCM with a key derived from AUTH_SECRET. The keysDir is used only
 * for temporary files during:
 * - Key generation (ssh-keygen requires filesystem access)
 * - Fingerprint calculation (ssh-keygen -lf requires file path)
 * - Git operations (git CLI requires key file paths)
 *
 * Temporary files are always cleaned up after use.
 */
export class SSHKeyService {
  private keysDir: string;
  private encryptionKey: Buffer;

  constructor() {
    // Directory for temporary files only - keys are stored encrypted in database
    this.keysDir = config.appHome.sshKeys;
    // Derive encryption key from AUTH_SECRET (32 bytes for AES-256)
    this.encryptionKey = crypto.scryptSync(config.auth.secret, 'ssh-key-salt', 32);
  }

  /**
   * Ensure the temporary SSH keys directory exists.
   * This directory is used for temporary files during key operations, not for permanent storage.
   */
  async ensureKeysDir(): Promise<void> {
    await fs.mkdir(this.keysDir, { recursive: true, mode: 0o700 });
  }

  /**
   * Generate a new SSH key pair
   */
  async generateKeyPair(keyType: SSHKeyType = 'ed25519', comment?: string): Promise<KeyPair> {
    await this.ensureKeysDir();

    // Create temporary file paths
    const tempId = crypto.randomUUID();
    const tempPrivateKeyPath = path.join(this.keysDir, `temp_${tempId}`);
    const tempPublicKeyPath = `${tempPrivateKeyPath}.pub`;

    try {
      // Generate key using ssh-keygen
      await new Promise<void>((resolve, reject) => {
        const args = [
          '-t', keyType,
          '-f', tempPrivateKeyPath,
          '-N', '', // No passphrase
          '-C', comment || 'vibe-anywhere-key',
        ];

        // For RSA, specify key size
        if (keyType === 'rsa') {
          args.push('-b', '4096');
        }

        const keygen = spawn('ssh-keygen', args);

        keygen.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`ssh-keygen exited with code ${code}`));
          }
        });

        keygen.on('error', reject);
      });

      // Read generated keys
      const [privateKey, publicKey] = await Promise.all([
        fs.readFile(tempPrivateKeyPath, 'utf-8'),
        fs.readFile(tempPublicKeyPath, 'utf-8'),
      ]);

      // Calculate fingerprint
      const fingerprint = await this.calculateFingerprint(tempPublicKeyPath);

      // Clean up temp files
      await Promise.all([
        fs.unlink(tempPrivateKeyPath),
        fs.unlink(tempPublicKeyPath),
      ]);

      return {
        publicKey: publicKey.trim(),
        privateKey,
        fingerprint,
      };
    } catch (error) {
      // Clean up on error
      try {
        await fs.unlink(tempPrivateKeyPath);
        await fs.unlink(tempPublicKeyPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Calculate SSH key fingerprint
   */
  private async calculateFingerprint(publicKeyPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      const keygen = spawn('ssh-keygen', ['-lf', publicKeyPath]);

      keygen.stdout.on('data', (data) => {
        output += data.toString();
      });

      keygen.on('close', (code) => {
        if (code === 0) {
          // Parse fingerprint from output (e.g., "256 SHA256:... comment (ED25519)")
          const match = output.match(/SHA256:[\w+/]+/);
          resolve(match ? match[0] : output.trim());
        } else {
          reject(new Error(`Failed to calculate fingerprint`));
        }
      });

      keygen.on('error', reject);
    });
  }

  /**
   * Encrypt a private key for storage
   */
  private encryptPrivateKey(privateKey: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);

    let encrypted = cipher.update(privateKey, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data
    return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]).toString('base64');
  }

  /**
   * Decrypt a private key
   */
  private decryptPrivateKey(encryptedData: string): string {
    const data = Buffer.from(encryptedData, 'base64');

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Add a new SSH key for a user
   */
  async addUserKey(userId: string, input: AddKeyInput): Promise<SSHKey> {
    // Calculate fingerprint from public key
    await this.ensureKeysDir();
    const tempPath = path.join(this.keysDir, `temp_${crypto.randomUUID()}.pub`);
    await fs.writeFile(tempPath, input.publicKey);
    let fingerprint: string;
    try {
      fingerprint = await this.calculateFingerprint(tempPath);
    } finally {
      await fs.unlink(tempPath);
    }

    // Encrypt private key
    const encryptedPrivateKey = this.encryptPrivateKey(input.privateKey);

    // Detect key type from public key if not provided
    let keyType = input.keyType;
    if (!keyType) {
      if (input.publicKey.includes('ssh-ed25519')) {
        keyType = 'ed25519';
      } else if (input.publicKey.includes('ssh-rsa')) {
        keyType = 'rsa';
      } else if (input.publicKey.includes('ecdsa')) {
        keyType = 'ecdsa';
      } else {
        keyType = 'ed25519';
      }
    }

    const now = Date.now();
    const keyId = crypto.randomUUID();

    // Use raw SQLite client directly to bypass Drizzle's pgEnum type system
    // This avoids issues with pgEnum not being compatible with SQLite
    if (queryClient && 'prepare' in queryClient) {
      // SQLite: Use raw prepared statements
      const stmt = (queryClient as Database.Database).prepare(`
        INSERT INTO ssh_keys (
          id, user_id, repository_id, name, public_key, private_key_encrypted,
          key_type, fingerprint, is_default, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(keyId, userId, null, input.name, input.publicKey, encryptedPrivateKey,
               keyType, fingerprint, 0, now, now);
    } else {
      // PostgreSQL: Use Drizzle ORM (pgEnum works fine here)
      await db.insert(sshKeys).values({
        id: keyId,
        userId: userId,
        repositoryId: null,
        name: input.name,
        publicKey: input.publicKey,
        privateKeyEncrypted: encryptedPrivateKey,
        keyType: keyType as any,
        fingerprint: fingerprint,
        isDefault: 0 as any,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Fetch the inserted key
    const [key] = await db.select().from(sshKeys).where(eq(sshKeys.id, keyId));
    return key;
  }

  /**
   * Add a new SSH key for a repository
   */
  async addRepositoryKey(repositoryId: string, input: AddKeyInput): Promise<SSHKey> {
    // Calculate fingerprint from public key
    await this.ensureKeysDir();
    const tempPath = path.join(this.keysDir, `temp_${crypto.randomUUID()}.pub`);
    await fs.writeFile(tempPath, input.publicKey);
    let fingerprint: string;
    try {
      fingerprint = await this.calculateFingerprint(tempPath);
    } finally {
      await fs.unlink(tempPath);
    }

    // Encrypt private key
    const encryptedPrivateKey = this.encryptPrivateKey(input.privateKey);

    // Detect key type from public key if not provided
    let keyType = input.keyType;
    if (!keyType) {
      if (input.publicKey.includes('ssh-ed25519')) {
        keyType = 'ed25519';
      } else if (input.publicKey.includes('ssh-rsa')) {
        keyType = 'rsa';
      } else if (input.publicKey.includes('ecdsa')) {
        keyType = 'ecdsa';
      } else {
        keyType = 'ed25519';
      }
    }

    const now = Date.now();
    const keyId = crypto.randomUUID();

    // Use raw SQLite client directly to bypass Drizzle's pgEnum type system
    if (queryClient && 'prepare' in queryClient) {
      // SQLite: Use raw prepared statements
      const stmt = (queryClient as Database.Database).prepare(`
        INSERT INTO ssh_keys (
          id, user_id, repository_id, name, public_key, private_key_encrypted,
          key_type, fingerprint, is_default, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(keyId, null, repositoryId, input.name, input.publicKey, encryptedPrivateKey,
               keyType, fingerprint, 0, now, now);
    } else {
      // PostgreSQL: Use Drizzle ORM (pgEnum works fine here)
      await db.insert(sshKeys).values({
        id: keyId,
        userId: null,
        repositoryId,
        name: input.name,
        publicKey: input.publicKey,
        privateKeyEncrypted: encryptedPrivateKey,
        keyType: keyType as any,
        fingerprint,
        isDefault: 0 as any,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Fetch the inserted key
    const [key] = await db.select().from(sshKeys).where(eq(sshKeys.id, keyId));
    return key;
  }

  /**
   * Generate and add a new SSH key for a user
   */
  async generateUserKey(userId: string, input: GenerateKeyInput): Promise<SSHKey> {
    const keyPair = await this.generateKeyPair(input.keyType || 'ed25519', input.comment);

    return this.addUserKey(userId, {
      name: input.name,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      keyType: input.keyType,
    });
  }

  /**
   * Generate and add a new SSH key for a repository
   */
  async generateRepositoryKey(repositoryId: string, input: GenerateKeyInput): Promise<SSHKey> {
    const keyPair = await this.generateKeyPair(input.keyType || 'ed25519', input.comment);

    return this.addRepositoryKey(repositoryId, {
      name: input.name,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      keyType: input.keyType,
    });
  }

  /**
   * Get a key by ID
   */
  async getKey(keyId: string): Promise<SSHKey | null> {
    const [key] = await db.select().from(sshKeys).where(eq(sshKeys.id, keyId));
    return key || null;
  }

  /**
   * List keys for a user
   */
  async listUserKeys(userId: string): Promise<SSHKey[]> {
    return db.select().from(sshKeys).where(eq(sshKeys.userId, userId));
  }

  /**
   * List keys for a repository
   */
  async listRepositoryKeys(repositoryId: string): Promise<SSHKey[]> {
    return db.select().from(sshKeys).where(eq(sshKeys.repositoryId, repositoryId));
  }

  /**
   * Get all applicable keys for a repository (includes user's default keys and repo-specific keys)
   */
  async getApplicableKeys(userId: string, repositoryId: string): Promise<SSHKey[]> {
    return db
      .select()
      .from(sshKeys)
      .where(
        or(
          and(eq(sshKeys.userId, userId), eq(sshKeys.isDefault, 1)), // SQLite uses 0/1 for boolean
          eq(sshKeys.repositoryId, repositoryId)
        )
      );
  }

  /**
   * Get the decrypted private key (for use in git operations)
   */
  async getDecryptedPrivateKey(keyId: string): Promise<string> {
    const key = await this.getKey(keyId);
    if (!key) {
      throw new Error(`SSH key ${keyId} not found`);
    }

    return this.decryptPrivateKey(key.privateKeyEncrypted);
  }

  /**
   * Write a private key to a temporary file for git operations
   * Returns the path to the temp file (caller must clean up)
   */
  async writeTempPrivateKey(keyId: string): Promise<string> {
    const privateKey = await this.getDecryptedPrivateKey(keyId);
    await this.ensureKeysDir();

    const tempPath = path.join(this.keysDir, `temp_${crypto.randomUUID()}`);
    await fs.writeFile(tempPath, privateKey, { mode: 0o600 });

    return tempPath;
  }

  /**
   * Set a key as the default for a user
   */
  async setDefaultKey(userId: string, keyId: string): Promise<void> {
    // First, unset all other defaults for this user
    await db
      .update(sshKeys)
      .set({ isDefault: 0 }) // SQLite uses 0/1 for boolean
      .where(eq(sshKeys.userId, userId));

    // Then set the new default
    await db
      .update(sshKeys)
      .set({ isDefault: 1 }) // SQLite uses 0/1 for boolean
      .where(and(eq(sshKeys.id, keyId), eq(sshKeys.userId, userId)));
  }

  /**
   * Delete a key
   */
  async deleteKey(keyId: string): Promise<void> {
    await db.delete(sshKeys).where(eq(sshKeys.id, keyId));
  }

  /**
   * Get key info without sensitive data (for API responses)
   */
  toKeyInfo(key: SSHKey): Omit<SSHKey, 'privateKeyEncrypted'> {
    const { privateKeyEncrypted, ...keyInfo } = key;
    return {
      ...keyInfo,
      isDefault: Boolean(keyInfo.isDefault), // Convert SQLite integer to boolean
    };
  }
}

// Singleton instance
let sshKeyServiceInstance: SSHKeyService | null = null;

export function getSSHKeyService(): SSHKeyService {
  if (!sshKeyServiceInstance) {
    sshKeyServiceInstance = new SSHKeyService();
  }
  return sshKeyServiceInstance;
}
