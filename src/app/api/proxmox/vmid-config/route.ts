/**
 * Proxmox VMID Configuration API
 *
 * GET  /api/proxmox/vmid-config - Get current VMID configuration
 * POST /api/proxmox/vmid-config - Update VMID configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getSettingsService, DEFAULT_STARTING_VMID } from '@/lib/services/settings-service';

/**
 * GET /api/proxmox/vmid-config
 * Returns the current VMID configuration
 */
export async function GET() {
  try {
    // Check if Proxmox is configured
    if (config.container.backend !== 'proxmox') {
      return NextResponse.json(
        { error: 'Proxmox backend not configured' },
        { status: 400 }
      );
    }

    const settingsService = getSettingsService();
    const vmidConfig = await settingsService.getVmidConfig();

    return NextResponse.json({
      ...vmidConfig,
      defaultStartingVmid: DEFAULT_STARTING_VMID,
    });
  } catch (error) {
    console.error('Error getting VMID config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get VMID config' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/proxmox/vmid-config
 * Update the VMID configuration
 *
 * Body: {
 *   startingVmid: number,
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check if Proxmox is configured
    if (config.container.backend !== 'proxmox') {
      return NextResponse.json(
        { error: 'Proxmox backend not configured' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { startingVmid } = body as { startingVmid: number };

    if (!startingVmid || typeof startingVmid !== 'number' || startingVmid < 100) {
      return NextResponse.json(
        { error: 'Invalid starting VMID. Must be a number >= 100.' },
        { status: 400 }
      );
    }

    const settingsService = getSettingsService();
    const currentConfig = await settingsService.getVmidConfig();

    // Only allow changing if no template exists yet
    const existingTemplate = await settingsService.getProxmoxTemplateVmid();
    if (existingTemplate) {
      return NextResponse.json(
        { error: 'Cannot change starting VMID while a template exists. Delete the template first.' },
        { status: 409 }
      );
    }

    await settingsService.saveVmidConfig({
      startingVmid,
      nextWorkspaceVmid: startingVmid + 1,
    });

    return NextResponse.json({
      success: true,
      startingVmid,
      nextWorkspaceVmid: startingVmid + 1,
    });
  } catch (error) {
    console.error('Error updating VMID config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update VMID config' },
      { status: 500 }
    );
  }
}
