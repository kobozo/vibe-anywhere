import { db } from '@/lib/db';
import { repositories, proxmoxTemplates, type EnvVarsJson, type EnvVarEntry } from '@/lib/db/schema';
import { config } from '@/lib/config';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';

// Note: config is still used for AUTH_SECRET to derive encryption key

// Algorithm for encryption (AES-256-GCM) - same as SSH keys
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export interface EnvVarInput {
  key: string;
  value: string;
  encrypted?: boolean;
}

export class EnvVarService {
  private encryptionKey: Buffer;

  constructor() {
    // Derive encryption key from AUTH_SECRET (32 bytes for AES-256)
    // Using different salt than SSH keys to keep them separate
    this.encryptionKey = crypto.scryptSync(config.auth.secret, 'env-var-salt', 32);
  }

  /**
   * Validate environment variable key format
   * Keys must be alphanumeric with underscores, and start with a letter or underscore
   */
  validateKey(key: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
  }

  /**
   * Encrypt a value for storage
   */
  encryptValue(value: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);

    let encrypted = cipher.update(value, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data
    return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]).toString('base64');
  }

  /**
   * Decrypt a stored value
   */
  decryptValue(encryptedData: string): string {
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
   * Process env vars for storage - encrypt values marked as encrypted
   */
  processForStorage(envVars: EnvVarInput[]): EnvVarsJson {
    const result: EnvVarsJson = {};

    for (const envVar of envVars) {
      if (!this.validateKey(envVar.key)) {
        throw new Error(`Invalid environment variable key: ${envVar.key}. Keys must start with a letter or underscore and contain only alphanumeric characters and underscores.`);
      }

      result[envVar.key] = {
        value: envVar.encrypted ? this.encryptValue(envVar.value) : envVar.value,
        encrypted: envVar.encrypted || false,
      };
    }

    return result;
  }

  /**
   * Decrypt env vars from storage to plain values
   */
  decryptEnvVars(envVars: EnvVarsJson): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, entry] of Object.entries(envVars)) {
      result[key] = entry.encrypted ? this.decryptValue(entry.value) : entry.value;
    }

    return result;
  }

  /**
   * Get env vars for display (mask encrypted values)
   */
  maskEnvVars(envVars: EnvVarsJson): Array<{ key: string; value: string; encrypted: boolean }> {
    return Object.entries(envVars).map(([key, entry]) => ({
      key,
      value: entry.encrypted ? '••••••••' : entry.value,
      encrypted: entry.encrypted,
    }));
  }

  /**
   * Get merged environment variables for a workspace
   * Inheritance order (lowest to highest priority):
   * 1. Template env vars
   * 2. Repository env vars (overrides template)
   */
  async getMergedEnvVars(repositoryId: string, templateId?: string | null): Promise<Record<string, string>> {
    const merged: Record<string, string> = {};

    // 1. Get template env vars if templateId provided
    if (templateId) {
      const [template] = await db
        .select({ envVars: proxmoxTemplates.envVars })
        .from(proxmoxTemplates)
        .where(eq(proxmoxTemplates.id, templateId));

      if (template?.envVars) {
        Object.assign(merged, this.decryptEnvVars(template.envVars));
      }
    }

    // 2. Get repository env vars (overrides template)
    const [repo] = await db
      .select({
        envVars: repositories.envVars,
        templateId: repositories.templateId,
      })
      .from(repositories)
      .where(eq(repositories.id, repositoryId));

    // If no templateId was provided, try to get it from repository
    if (!templateId && repo?.templateId) {
      const [template] = await db
        .select({ envVars: proxmoxTemplates.envVars })
        .from(proxmoxTemplates)
        .where(eq(proxmoxTemplates.id, repo.templateId));

      if (template?.envVars) {
        Object.assign(merged, this.decryptEnvVars(template.envVars));
      }
    }

    if (repo?.envVars) {
      Object.assign(merged, this.decryptEnvVars(repo.envVars));
    }

    return merged;
  }

  /**
   * Get env vars for a repository (decrypted, for display in UI)
   */
  async getRepositoryEnvVars(repositoryId: string): Promise<Array<{ key: string; value: string; encrypted: boolean }>> {
    const [repo] = await db
      .select({ envVars: repositories.envVars })
      .from(repositories)
      .where(eq(repositories.id, repositoryId));

    if (!repo?.envVars) {
      return [];
    }

    return this.maskEnvVars(repo.envVars);
  }

  /**
   * Get env vars for a template (decrypted, for display in UI)
   */
  async getTemplateEnvVars(templateId: string): Promise<Array<{ key: string; value: string; encrypted: boolean }>> {
    const [template] = await db
      .select({ envVars: proxmoxTemplates.envVars })
      .from(proxmoxTemplates)
      .where(eq(proxmoxTemplates.id, templateId));

    if (!template?.envVars) {
      return [];
    }

    return this.maskEnvVars(template.envVars);
  }

  /**
   * Update env vars for a repository
   */
  async updateRepositoryEnvVars(repositoryId: string, envVars: EnvVarInput[]): Promise<void> {
    const processedEnvVars = this.processForStorage(envVars);

    await db
      .update(repositories)
      .set({
        envVars: processedEnvVars,
        updatedAt: new Date(),
      })
      .where(eq(repositories.id, repositoryId));
  }

  /**
   * Update env vars for a template
   */
  async updateTemplateEnvVars(templateId: string, envVars: EnvVarInput[]): Promise<void> {
    const processedEnvVars = this.processForStorage(envVars);

    await db
      .update(proxmoxTemplates)
      .set({
        envVars: processedEnvVars,
        updatedAt: new Date(),
      })
      .where(eq(proxmoxTemplates.id, templateId));
  }

  /**
   * Get inherited template env vars for a repository (for UI display)
   */
  async getInheritedEnvVarsForRepository(repositoryId: string): Promise<Record<string, string>> {
    const [repo] = await db
      .select({ templateId: repositories.templateId })
      .from(repositories)
      .where(eq(repositories.id, repositoryId));

    if (!repo?.templateId) {
      return {};
    }

    const [template] = await db
      .select({ envVars: proxmoxTemplates.envVars })
      .from(proxmoxTemplates)
      .where(eq(proxmoxTemplates.id, repo.templateId));

    if (!template?.envVars) {
      return {};
    }

    // Return decrypted values for display
    return this.decryptEnvVars(template.envVars);
  }
}

// Singleton instance
let envVarServiceInstance: EnvVarService | null = null;

export function getEnvVarService(): EnvVarService {
  if (!envVarServiceInstance) {
    envVarServiceInstance = new EnvVarService();
  }
  return envVarServiceInstance;
}
