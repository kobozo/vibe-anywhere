import { db } from '@/lib/db';
import { workspaces, repositories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getEnvVarService } from './env-var-service';
import { execSSHCommand } from '@/lib/container/proxmox/ssh-stream';
import type { EnvVarDiff, EnvVarDiffDetails } from '@/types/env-sync';

/**
 * Service for detecting differences between workspace .env files
 * and repository environment variables.
 */
export class EnvVarSyncService {
  /**
   * Parse .env file content into key-value pairs
   */
  parseEnvFile(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Compare two sets of environment variables and return detailed diff
   */
  compareEnvVars(
    workspaceVars: Record<string, string>,
    repoVars: Record<string, string>
  ): EnvVarDiffDetails {
    const workspaceKeys = new Set(Object.keys(workspaceVars));
    const repoKeys = new Set(Object.keys(repoVars));

    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    const unchanged: string[] = [];

    // Find added keys (in workspace but not in repo)
    for (const key of workspaceKeys) {
      if (!repoKeys.has(key)) {
        added.push(key);
      }
    }

    // Find removed keys (in repo but not in workspace)
    for (const key of repoKeys) {
      if (!workspaceKeys.has(key)) {
        removed.push(key);
      }
    }

    // Find changed and unchanged keys
    for (const key of workspaceKeys) {
      if (repoKeys.has(key)) {
        if (workspaceVars[key] !== repoVars[key]) {
          changed.push(key);
        } else {
          unchanged.push(key);
        }
      }
    }

    // Sort all arrays for consistent display
    return {
      added: added.sort(),
      removed: removed.sort(),
      changed: changed.sort(),
      unchanged: unchanged.sort(),
    };
  }

  /**
   * Get the diff between workspace .env and repository env vars
   */
  async getEnvVarDiff(workspaceId: string): Promise<EnvVarDiff> {
    // Get workspace with repository info
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Check if container is running
    if (workspace.containerStatus !== 'running' || !workspace.containerIp) {
      return {
        hasDifferences: false,
        envFileExists: false,
        containerRunning: false,
        diff: { added: [], removed: [], changed: [], unchanged: [] },
        workspaceVars: {},
        repoVars: {},
      };
    }

    // Try to read .env file from container
    let workspaceVars: Record<string, string> = {};
    let envFileExists = false;

    try {
      const result = await execSSHCommand(
        { host: workspace.containerIp, username: 'root' },
        ['cat', '/workspace/.env'],
        { workingDir: '/workspace' }
      );

      if (result.exitCode === 0) {
        envFileExists = true;
        workspaceVars = this.parseEnvFile(result.stdout);
      }
    } catch (error) {
      console.error('Failed to read .env file from container:', error);
      // Continue with empty workspace vars
    }

    // If no .env file exists, no diff to show
    if (!envFileExists) {
      return {
        hasDifferences: false,
        envFileExists: false,
        containerRunning: true,
        diff: { added: [], removed: [], changed: [], unchanged: [] },
        workspaceVars: {},
        repoVars: {},
      };
    }

    // Get repository env vars (merged with template)
    const envVarService = getEnvVarService();
    const repoVars = await envVarService.getMergedEnvVars(
      workspace.repositoryId,
      workspace.templateId ?? undefined
    );

    // Compare
    const diff = this.compareEnvVars(workspaceVars, repoVars);
    const hasDifferences = diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;

    return {
      hasDifferences,
      envFileExists: true,
      containerRunning: true,
      diff,
      workspaceVars,
      repoVars,
    };
  }
}

// Singleton instance
let envVarSyncServiceInstance: EnvVarSyncService | null = null;

export function getEnvVarSyncService(): EnvVarSyncService {
  if (!envVarSyncServiceInstance) {
    envVarSyncServiceInstance = new EnvVarSyncService();
  }
  return envVarSyncServiceInstance;
}
