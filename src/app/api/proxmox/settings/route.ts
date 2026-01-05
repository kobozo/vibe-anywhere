/**
 * Proxmox Settings API
 * GET/POST endpoints for managing Proxmox general settings
 */

import { NextRequest } from 'next/server';
import { getSettingsService, type ProxmoxSettings } from '@/lib/services/settings-service';
import { requireAuth, successResponse, errorResponse, withErrorHandling } from '@/lib/api-utils';

/**
 * GET /api/proxmox/settings
 * Get current Proxmox settings
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const settingsService = getSettingsService();
  const settings = await settingsService.getProxmoxSettings();

  return successResponse(settings);
});

/**
 * POST /api/proxmox/settings
 * Update Proxmox settings
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const body = await request.json();

  // Validate the settings
  const settings: ProxmoxSettings = {};

  if (body.vlanTag !== undefined) {
    if (body.vlanTag !== null && (typeof body.vlanTag !== 'number' || body.vlanTag < 1 || body.vlanTag > 4094)) {
      return errorResponse('INVALID_VLAN_TAG', 'VLAN tag must be a number between 1 and 4094, or null to disable', 400);
    }
    settings.vlanTag = body.vlanTag ?? undefined;
  }

  if (body.defaultStorage !== undefined) {
    if (body.defaultStorage !== null && typeof body.defaultStorage !== 'string') {
      return errorResponse('INVALID_STORAGE', 'Default storage must be a string', 400);
    }
    settings.defaultStorage = body.defaultStorage ?? undefined;
  }

  if (body.defaultMemory !== undefined) {
    if (body.defaultMemory !== null && (typeof body.defaultMemory !== 'number' || body.defaultMemory < 256)) {
      return errorResponse('INVALID_MEMORY', 'Default memory must be a number >= 256 MB', 400);
    }
    settings.defaultMemory = body.defaultMemory ?? undefined;
  }

  if (body.defaultCpuCores !== undefined) {
    if (body.defaultCpuCores !== null && (typeof body.defaultCpuCores !== 'number' || body.defaultCpuCores < 1)) {
      return errorResponse('INVALID_CPU_CORES', 'Default CPU cores must be a number >= 1', 400);
    }
    settings.defaultCpuCores = body.defaultCpuCores ?? undefined;
  }

  const settingsService = getSettingsService();

  // Merge with existing settings
  const existingSettings = await settingsService.getProxmoxSettings();
  const mergedSettings = { ...existingSettings, ...settings };

  await settingsService.saveProxmoxSettings(mergedSettings);

  return successResponse(mergedSettings);
});
