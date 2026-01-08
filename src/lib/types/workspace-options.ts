/**
 * Workspace creation options types
 * Defines advanced options for workspace provisioning
 */

import type { NetworkConfig } from './network-config';

/**
 * Basic workspace creation input (required fields)
 */
export interface BasicWorkspaceInput {
  /** Display name for the workspace */
  name: string;
  /** Branch name to checkout or create */
  branchName: string;
  /** Base branch for new branch creation (optional) */
  baseBranch?: string;
}

/**
 * Advanced workspace creation options (all optional)
 */
export interface AdvancedWorkspaceOptions {
  /** Static IP configuration (CIDR + gateway) */
  networkConfig?: NetworkConfig;
  /** Force specific VMID instead of auto-allocation */
  forcedVmid?: number;
  /** Override repository's default template */
  overrideTemplateId?: string;
}

/**
 * Complete workspace creation input combining basic and advanced options
 */
export interface WorkspaceCreationInput extends BasicWorkspaceInput {
  /** Advanced options (all optional) */
  advanced?: AdvancedWorkspaceOptions;
}

/**
 * Convert flat API request to WorkspaceCreationInput
 * Used when receiving flattened form data from frontend
 */
export interface FlatWorkspaceCreationRequest extends BasicWorkspaceInput {
  staticIpAddress?: string;
  staticIpGateway?: string;
  forcedVmid?: number;
  overrideTemplateId?: string;
}

/**
 * Convert flat request to structured input
 */
export function toWorkspaceCreationInput(flat: FlatWorkspaceCreationRequest): WorkspaceCreationInput {
  const input: WorkspaceCreationInput = {
    name: flat.name,
    branchName: flat.branchName,
    baseBranch: flat.baseBranch,
  };

  // Build advanced options if any are provided
  if (flat.staticIpAddress || flat.staticIpGateway || flat.forcedVmid || flat.overrideTemplateId) {
    input.advanced = {};

    if (flat.staticIpAddress && flat.staticIpGateway) {
      input.advanced.networkConfig = {
        ipAddress: flat.staticIpAddress,
        gateway: flat.staticIpGateway,
      };
    }

    if (flat.forcedVmid) {
      input.advanced.forcedVmid = flat.forcedVmid;
    }

    if (flat.overrideTemplateId) {
      input.advanced.overrideTemplateId = flat.overrideTemplateId;
    }
  }

  return input;
}

/**
 * Check if workspace has any advanced options configured
 */
export function hasAdvancedOptions(input: WorkspaceCreationInput): boolean {
  if (!input.advanced) return false;

  return Boolean(
    input.advanced.networkConfig ||
    input.advanced.forcedVmid ||
    input.advanced.overrideTemplateId
  );
}
