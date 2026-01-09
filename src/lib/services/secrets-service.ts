/**
 * Secrets Service
 * Manages user-level encrypted environment variables (secrets vault)
 */

import { db } from '@/lib/db';
import {
  secrets,
  repositorySecrets,
  workspaces,
  repositories,
  type Secret,
  type NewSecret,
  type RepositorySecret
} from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getEnvVarService } from './env-var-service';

export interface SecretInput {
  name: string;
  envKey: string;
  value: string;
  description?: string;
  templateWhitelist: string[];
}

export interface SecretInfo {
  id: string;
  name: string;
  envKey: string;
  valueMasked: string;
  description: string | null;
  templateWhitelist: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RepositorySecretAssignment {
  secretId: string;
  includeInEnvFile: boolean;
}

export class SecretsService {
  private envVarService = getEnvVarService();

  /**
   * Create a new secret
   */
  async createSecret(userId: string, input: SecretInput): Promise<Secret> {
    // Validate env key format
    if (!this.envVarService.validateKey(input.envKey)) {
      throw new Error(
        `Invalid environment variable key: ${input.envKey}. Keys must start with a letter or underscore and contain only alphanumeric characters and underscores.`
      );
    }

    // Encrypt the value
    const valueEncrypted = this.envVarService.encryptValue(input.value);

    const [secret] = await db
      .insert(secrets)
      .values({
        userId,
        name: input.name,
        envKey: input.envKey,
        valueEncrypted,
        description: input.description || null,
        templateWhitelist: input.templateWhitelist,
      })
      .returning();

    return secret;
  }

  /**
   * Update a secret
   */
  async updateSecret(
    secretId: string,
    userId: string,
    updates: Partial<SecretInput>
  ): Promise<Secret> {
    const updateData: Partial<NewSecret> = {
      updatedAt: new Date(),
    };

    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }

    if (updates.envKey !== undefined) {
      if (!this.envVarService.validateKey(updates.envKey)) {
        throw new Error(
          `Invalid environment variable key: ${updates.envKey}. Keys must start with a letter or underscore and contain only alphanumeric characters and underscores.`
        );
      }
      updateData.envKey = updates.envKey;
    }

    if (updates.value !== undefined) {
      updateData.valueEncrypted = this.envVarService.encryptValue(updates.value);
    }

    if (updates.description !== undefined) {
      updateData.description = updates.description;
    }

    if (updates.templateWhitelist !== undefined) {
      updateData.templateWhitelist = updates.templateWhitelist;
    }

    const [secret] = await db
      .update(secrets)
      .set(updateData)
      .where(and(eq(secrets.id, secretId), eq(secrets.userId, userId)))
      .returning();

    if (!secret) {
      throw new Error('Secret not found or access denied');
    }

    return secret;
  }

  /**
   * Delete a secret
   */
  async deleteSecret(secretId: string, userId: string): Promise<void> {
    await db
      .delete(secrets)
      .where(and(eq(secrets.id, secretId), eq(secrets.userId, userId)));
  }

  /**
   * Get a single secret (with masked value)
   */
  async getSecret(secretId: string, userId: string): Promise<SecretInfo | null> {
    const [secret] = await db
      .select()
      .from(secrets)
      .where(and(eq(secrets.id, secretId), eq(secrets.userId, userId)));

    if (!secret) {
      return null;
    }

    return {
      id: secret.id,
      name: secret.name,
      envKey: secret.envKey,
      valueMasked: '••••••••',
      description: secret.description,
      templateWhitelist: secret.templateWhitelist as string[],
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    };
  }

  /**
   * List user secrets (with masked values)
   */
  async listUserSecrets(userId: string): Promise<SecretInfo[]> {
    const userSecrets = await db
      .select()
      .from(secrets)
      .where(eq(secrets.userId, userId))
      .orderBy(secrets.createdAt);

    return userSecrets.map((s) => ({
      id: s.id,
      name: s.name,
      envKey: s.envKey,
      valueMasked: '••••••••',
      description: s.description,
      templateWhitelist: s.templateWhitelist as string[],
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  /**
   * Assign secrets to a repository (batch operation)
   */
  async assignSecretsToRepository(
    repositoryId: string,
    assignments: RepositorySecretAssignment[]
  ): Promise<void> {
    if (assignments.length === 0) {
      return;
    }

    // Delete existing assignments for this repository
    await db
      .delete(repositorySecrets)
      .where(eq(repositorySecrets.repositoryId, repositoryId));

    // Insert new assignments
    await db.insert(repositorySecrets).values(
      assignments.map((a) => ({
        repositoryId,
        secretId: a.secretId,
        includeInEnvFile: a.includeInEnvFile,
      }))
    );
  }

  /**
   * Remove a single secret assignment from a repository
   */
  async unassignSecretFromRepository(
    repositoryId: string,
    secretId: string
  ): Promise<void> {
    await db
      .delete(repositorySecrets)
      .where(
        and(
          eq(repositorySecrets.repositoryId, repositoryId),
          eq(repositorySecrets.secretId, secretId)
        )
      );
  }

  /**
   * Get secrets assigned to a repository
   */
  async getRepositorySecrets(repositoryId: string): Promise<
    Array<{
      secret: SecretInfo;
      includeInEnvFile: boolean;
    }>
  > {
    const assignments = await db
      .select({
        secret: secrets,
        includeInEnvFile: repositorySecrets.includeInEnvFile,
      })
      .from(repositorySecrets)
      .innerJoin(secrets, eq(secrets.id, repositorySecrets.secretId))
      .where(eq(repositorySecrets.repositoryId, repositoryId));

    return assignments.map((a) => ({
      secret: {
        id: a.secret.id,
        name: a.secret.name,
        envKey: a.secret.envKey,
        valueMasked: '••••••••',
        description: a.secret.description,
        templateWhitelist: a.secret.templateWhitelist as string[],
        createdAt: a.secret.createdAt,
        updatedAt: a.secret.updatedAt,
      },
      includeInEnvFile: a.includeInEnvFile,
    }));
  }

  /**
   * Get secrets for a specific tab (filtered by template whitelist)
   * Returns decrypted env vars ready for injection
   */
  async getSecretsForTab(
    workspaceId: string,
    templateName: string
  ): Promise<Record<string, string>> {
    // Get repository for workspace
    const [workspace] = await db
      .select({ repositoryId: workspaces.repositoryId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Get secrets assigned to repository
    const repoSecrets = await db
      .select({ secret: secrets })
      .from(repositorySecrets)
      .innerJoin(secrets, eq(secrets.id, repositorySecrets.secretId))
      .where(eq(repositorySecrets.repositoryId, workspace.repositoryId));

    // Filter by template whitelist
    const filtered = repoSecrets.filter(({ secret }) => {
      const whitelist = secret.templateWhitelist as string[];
      return whitelist.includes('*') || whitelist.includes(templateName);
    });

    // Decrypt and return as KEY=value pairs
    const envVars: Record<string, string> = {};
    for (const { secret } of filtered) {
      try {
        envVars[secret.envKey] = this.envVarService.decryptValue(secret.valueEncrypted);
      } catch (error) {
        console.error(`Failed to decrypt secret ${secret.id}:`, error);
        // Skip this secret, continue with others - don't fail entire operation
      }
    }

    return envVars;
  }

  /**
   * Get secret keys assigned to a workspace (for sync logic)
   * Returns just the env key names, not values
   */
  async getWorkspaceSecretKeys(workspaceId: string): Promise<string[]> {
    // Get repository for workspace
    const [workspace] = await db
      .select({ repositoryId: workspaces.repositoryId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));

    if (!workspace) {
      return [];
    }

    // Get secrets assigned to repository
    const repoSecrets = await db
      .select({ envKey: secrets.envKey })
      .from(repositorySecrets)
      .innerJoin(secrets, eq(secrets.id, repositorySecrets.secretId))
      .where(eq(repositorySecrets.repositoryId, workspace.repositoryId));

    return repoSecrets.map((s) => s.envKey);
  }

  /**
   * Write secrets to workspace .env file
   * Only writes secrets with includeInEnvFile=true
   */
  async writeSecretsToEnvFile(workspaceId: string): Promise<{
    written: number;
    secrets: string[];
  }> {
    // Get repository for workspace
    const [workspace] = await db
      .select({ repositoryId: workspaces.repositoryId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Get secrets with includeInEnvFile=true
    const secretsToWrite = await db
      .select({ secret: secrets })
      .from(repositorySecrets)
      .innerJoin(secrets, eq(secrets.id, repositorySecrets.secretId))
      .where(
        and(
          eq(repositorySecrets.repositoryId, workspace.repositoryId),
          eq(repositorySecrets.includeInEnvFile, true)
        )
      );

    // Decrypt secrets
    const envVars: Record<string, string> = {};
    for (const { secret } of secretsToWrite) {
      try {
        envVars[secret.envKey] = this.envVarService.decryptValue(secret.valueEncrypted);
      } catch (error) {
        console.error(`Failed to decrypt secret ${secret.id}:`, error);
        // Skip this secret
      }
    }

    // TODO: Actually write to /workspace/.env file via SSH
    // This will be implemented in the API endpoint
    // For now, return what would be written

    return {
      written: Object.keys(envVars).length,
      secrets: Object.keys(envVars),
    };
  }
}

// Singleton instance
let secretsServiceInstance: SecretsService | null = null;

export function getSecretsService(): SecretsService {
  if (!secretsServiceInstance) {
    secretsServiceInstance = new SecretsService();
  }
  return secretsServiceInstance;
}
