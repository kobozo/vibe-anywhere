/**
 * Proxmox Settings API
 * GET/POST endpoints for managing all Proxmox settings
 */

import { NextRequest } from 'next/server';
import { getSettingsService, type ProxmoxSettings } from '@/lib/services/settings-service';
import { requireAuth, successResponse, errorResponse, withErrorHandling } from '@/lib/api-utils';

/**
 * Response structure for GET /api/proxmox/settings
 */
interface ProxmoxSettingsResponse {
  connection: {
    isConfigured: boolean;
    host?: string;
    port?: number;
    tokenId?: string;
    node?: string;
    // Never return tokenSecret
  };
  network: {
    bridge?: string;
    vlanTag?: number;
  };
  resources: {
    defaultStorage?: string;
    defaultMemory?: number;
    defaultCpuCores?: number;
    defaultDiskSize?: number;
  };
  templates: {
    defaultCtTemplate?: string;
  };
}

/**
 * GET /api/proxmox/settings
 * Get current Proxmox settings from database
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const settingsService = getSettingsService();

  // Get connection settings (without decrypted token)
  const connectionConfigured = await settingsService.isProxmoxConnectionConfigured();
  let connectionSettings = null;
  if (connectionConfigured) {
    const fullConnection = await settingsService.getProxmoxConnectionSettings();
    if (fullConnection) {
      connectionSettings = {
        host: fullConnection.host,
        port: fullConnection.port,
        tokenId: fullConnection.tokenId,
        node: fullConnection.node,
      };
    }
  }

  // Get general settings from DB
  const dbSettings = await settingsService.getProxmoxSettings();

  const response: ProxmoxSettingsResponse = {
    connection: {
      isConfigured: connectionConfigured,
      host: connectionSettings?.host,
      port: connectionSettings?.port,
      tokenId: connectionSettings?.tokenId,
      node: connectionSettings?.node,
    },
    network: {
      bridge: dbSettings.bridge,
      vlanTag: dbSettings.vlanTag,
    },
    resources: {
      defaultStorage: dbSettings.defaultStorage,
      defaultMemory: dbSettings.defaultMemory,
      defaultCpuCores: dbSettings.defaultCpuCores,
      defaultDiskSize: dbSettings.defaultDiskSize,
    },
    templates: {
      defaultCtTemplate: dbSettings.defaultCtTemplate,
    },
  };

  return successResponse(response);
});

/**
 * POST /api/proxmox/settings
 * Update Proxmox settings (supports partial updates)
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const body = await request.json();
  const settingsService = getSettingsService();

  // Handle connection settings separately (they have their own encrypted storage)
  if (body.connection) {
    const conn = body.connection;

    // Validate connection fields if provided
    if (conn.host !== undefined && typeof conn.host !== 'string') {
      return errorResponse('INVALID_HOST', 'Host must be a string', 400);
    }
    if (conn.port !== undefined && (typeof conn.port !== 'number' || conn.port < 1 || conn.port > 65535)) {
      return errorResponse('INVALID_PORT', 'Port must be a number between 1 and 65535', 400);
    }
    if (conn.tokenId !== undefined && typeof conn.tokenId !== 'string') {
      return errorResponse('INVALID_TOKEN_ID', 'Token ID must be a string', 400);
    }
    if (conn.tokenSecret !== undefined && typeof conn.tokenSecret !== 'string') {
      return errorResponse('INVALID_TOKEN_SECRET', 'Token secret must be a string', 400);
    }
    if (conn.node !== undefined && typeof conn.node !== 'string') {
      return errorResponse('INVALID_NODE', 'Node must be a string', 400);
    }

    // If all required fields are provided, save the connection
    if (conn.host && conn.tokenId && conn.tokenSecret && conn.node) {
      await settingsService.saveProxmoxConnectionSettings(
        {
          host: conn.host,
          port: conn.port ?? 8006,
          tokenId: conn.tokenId,
          node: conn.node,
        },
        conn.tokenSecret
      );
    }
  }

  // Build the general settings object
  const settings: ProxmoxSettings = {};
  const existingSettings = await settingsService.getProxmoxSettings();

  // Network settings
  if (body.network) {
    if (body.network.bridge !== undefined) {
      if (body.network.bridge !== null && typeof body.network.bridge !== 'string') {
        return errorResponse('INVALID_BRIDGE', 'Bridge must be a string', 400);
      }
      settings.bridge = body.network.bridge ?? undefined;
    }
    if (body.network.vlanTag !== undefined) {
      if (body.network.vlanTag !== null && (typeof body.network.vlanTag !== 'number' || body.network.vlanTag < 1 || body.network.vlanTag > 4094)) {
        return errorResponse('INVALID_VLAN_TAG', 'VLAN tag must be a number between 1 and 4094, or null to disable', 400);
      }
      settings.vlanTag = body.network.vlanTag ?? undefined;
    }
  }

  // Resource settings
  if (body.resources) {
    if (body.resources.defaultStorage !== undefined) {
      if (body.resources.defaultStorage !== null && typeof body.resources.defaultStorage !== 'string') {
        return errorResponse('INVALID_STORAGE', 'Default storage must be a string', 400);
      }
      settings.defaultStorage = body.resources.defaultStorage ?? undefined;
    }
    if (body.resources.defaultMemory !== undefined) {
      if (body.resources.defaultMemory !== null && (typeof body.resources.defaultMemory !== 'number' || body.resources.defaultMemory < 256)) {
        return errorResponse('INVALID_MEMORY', 'Default memory must be a number >= 256 MB', 400);
      }
      settings.defaultMemory = body.resources.defaultMemory ?? undefined;
    }
    if (body.resources.defaultCpuCores !== undefined) {
      if (body.resources.defaultCpuCores !== null && (typeof body.resources.defaultCpuCores !== 'number' || body.resources.defaultCpuCores < 1)) {
        return errorResponse('INVALID_CPU_CORES', 'Default CPU cores must be a number >= 1', 400);
      }
      settings.defaultCpuCores = body.resources.defaultCpuCores ?? undefined;
    }
    if (body.resources.defaultDiskSize !== undefined) {
      if (body.resources.defaultDiskSize !== null && (typeof body.resources.defaultDiskSize !== 'number' || body.resources.defaultDiskSize < 1)) {
        return errorResponse('INVALID_DISK_SIZE', 'Default disk size must be a number >= 1 GB', 400);
      }
      settings.defaultDiskSize = body.resources.defaultDiskSize ?? undefined;
    }
  }

  // Template settings
  if (body.templates) {
    if (body.templates.defaultCtTemplate !== undefined) {
      if (body.templates.defaultCtTemplate !== null && typeof body.templates.defaultCtTemplate !== 'string') {
        return errorResponse('INVALID_DEFAULT_CT_TEMPLATE', 'Default CT template must be a string', 400);
      }
      settings.defaultCtTemplate = body.templates.defaultCtTemplate ?? undefined;
    }
  }

  // Legacy flat format support (backwards compatibility)
  if (body.vlanTag !== undefined) settings.vlanTag = body.vlanTag ?? undefined;
  if (body.defaultStorage !== undefined) settings.defaultStorage = body.defaultStorage ?? undefined;
  if (body.defaultMemory !== undefined) settings.defaultMemory = body.defaultMemory ?? undefined;
  if (body.defaultCpuCores !== undefined) settings.defaultCpuCores = body.defaultCpuCores ?? undefined;
  if (body.defaultDiskSize !== undefined) settings.defaultDiskSize = body.defaultDiskSize ?? undefined;

  // Merge with existing settings and save
  const mergedSettings = { ...existingSettings, ...settings };
  await settingsService.saveProxmoxSettings(mergedSettings);

  return successResponse({ success: true });
});

/**
 * DELETE /api/proxmox/settings
 * Clear Proxmox connection settings
 */
export const DELETE = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const settingsService = getSettingsService();
  await settingsService.clearProxmoxConnectionSettings();

  return successResponse({ success: true });
});
