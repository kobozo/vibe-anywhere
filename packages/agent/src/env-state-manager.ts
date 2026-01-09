/**
 * EnvStateManager
 * Manages persistent environment variable state in /workspace/.session-hub-env-state.json
 * Tracks what variables were synced to enable diff-based updates
 */

import * as fs from 'fs';

export interface EnvVarState {
  version: number;
  lastSync: string; // ISO timestamp
  workspaceId: string;
  repositoryId: string;
  envVars: Record<string, {
    value: string;
    encrypted: boolean;
    syncedAt: string;
  }>;
}

export interface EnvVarDiff {
  toAdd: Record<string, string>;
  toRemove: string[];
  toChange: Record<string, { oldValue: string; newValue: string }>;
}

export class EnvStateManager {
  private stateFilePath: string;
  private currentState: EnvVarState | null = null;

  constructor(workspaceId: string) {
    // Store state in user's home directory (not workspace folder)
    const homeDir = process.env.HOME || '/home/kobozo';
    this.stateFilePath = `${homeDir}/.session-hub-env-state.json`;
  }

  /**
   * Load state from file (called on agent startup)
   */
  async loadState(): Promise<EnvVarState | null> {
    try {
      const content = await fs.promises.readFile(this.stateFilePath, 'utf8');
      this.currentState = JSON.parse(content);
      console.log(`Loaded env var state: ${Object.keys(this.currentState?.envVars || {}).length} variables`);
      return this.currentState;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet - first sync
        console.log('No existing env var state file (fresh install)');
        return null;
      }

      if (error instanceof SyntaxError) {
        // JSON parse error - corrupt file
        console.warn('Env var state file is corrupt, backing up and starting fresh');
        try {
          const backupPath = `${this.stateFilePath}.corrupt.${Date.now()}`;
          await fs.promises.rename(this.stateFilePath, backupPath);
          console.log(`Backed up corrupt state file to ${backupPath}`);
        } catch (backupError) {
          console.error('Failed to backup corrupt state file:', backupError);
        }
        return null;
      }

      // Other error (permissions, etc.)
      console.error('Failed to load env var state:', error);
      throw error;
    }
  }

  /**
   * Compare new env vars with current state
   * Returns what needs to be added/removed/changed
   */
  computeDiff(
    newEnvVars: Record<string, string>,
    repositoryId: string
  ): EnvVarDiff {
    const diff: EnvVarDiff = {
      toAdd: {},
      toRemove: [],
      toChange: {},
    };

    const oldVars = this.currentState?.envVars || {};
    const oldKeys = new Set(Object.keys(oldVars));
    const newKeys = new Set(Object.keys(newEnvVars));

    // Find additions
    for (const key of newKeys) {
      if (!oldKeys.has(key)) {
        diff.toAdd[key] = newEnvVars[key];
      } else {
        // Check if value changed
        const oldValue = oldVars[key].value;
        const newValue = newEnvVars[key];
        if (oldValue !== newValue) {
          diff.toChange[key] = { oldValue, newValue };
        }
      }
    }

    // Find removals
    for (const key of oldKeys) {
      if (!newKeys.has(key)) {
        diff.toRemove.push(key);
      }
    }

    return diff;
  }

  /**
   * Save new state to file
   */
  async saveState(
    envVars: Record<string, string>,
    workspaceId: string,
    repositoryId: string
  ): Promise<void> {
    const now = new Date().toISOString();

    const newState: EnvVarState = {
      version: 1,
      lastSync: now,
      workspaceId,
      repositoryId,
      envVars: Object.fromEntries(
        Object.entries(envVars).map(([key, value]) => [
          key,
          {
            value,
            encrypted: false, // Could enhance later
            syncedAt: now,
          }
        ])
      ),
    };

    // Write atomically: write to temp file, then rename
    const tempPath = `${this.stateFilePath}.tmp`;
    try {
      await fs.promises.writeFile(
        tempPath,
        JSON.stringify(newState, null, 2),
        'utf8'
      );

      // Set restrictive permissions (600 - owner read/write only)
      await fs.promises.chmod(tempPath, 0o600);

      // Atomic rename
      await fs.promises.rename(tempPath, this.stateFilePath);

      this.currentState = newState;
      console.log(`Saved env var state to ${this.stateFilePath}: ${Object.keys(envVars).length} variables`);
    } catch (error) {
      console.error(`Failed to save env var state to ${this.stateFilePath}:`, error);
      // Clean up temp file if it exists
      try {
        await fs.promises.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Get current state (for debugging)
   */
  getState(): EnvVarState | null {
    return this.currentState;
  }
}
