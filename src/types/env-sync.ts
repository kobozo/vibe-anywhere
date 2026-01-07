/**
 * Types for environment variable sync detection
 */

/**
 * Detailed diff between workspace .env and repository env vars
 */
export interface EnvVarDiffDetails {
  /** Keys present in workspace .env but not in repository */
  added: string[];
  /** Keys present in repository but not in workspace .env */
  removed: string[];
  /** Keys present in both but with different values */
  changed: string[];
  /** Keys present in both with same values */
  unchanged: string[];
}

/**
 * Full diff result from the API
 */
export interface EnvVarDiff {
  /** Whether any differences exist */
  hasDifferences: boolean;
  /** Whether the .env file exists in the workspace */
  envFileExists: boolean;
  /** Whether the container is running */
  containerRunning: boolean;
  /** Detailed breakdown of differences */
  diff: EnvVarDiffDetails;
  /** Env vars from workspace .env file */
  workspaceVars: Record<string, string>;
  /** Env vars from repository (merged with template) */
  repoVars: Record<string, string>;
}

/**
 * Container operation types that trigger env var sync check
 */
export type ContainerOperation = 'redeploy' | 'destroy' | 'delete';

/**
 * Display labels for container operations
 */
export const operationLabels: Record<ContainerOperation, { action: string; verb: string }> = {
  redeploy: { action: 'Redeploy', verb: 'redeploying' },
  destroy: { action: 'Destroy', verb: 'destroying' },
  delete: { action: 'Delete', verb: 'deleting' },
};
