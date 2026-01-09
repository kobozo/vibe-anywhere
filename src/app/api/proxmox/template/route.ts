/**
 * Proxmox Template Management API
 *
 * GET  /api/proxmox/template - Check template status
 * POST /api/proxmox/template - Create/recreate template
 * DELETE /api/proxmox/template - Delete existing template
 */

import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { ProxmoxTemplateManager } from '@/lib/container/proxmox/template-manager';
import { getProxmoxClientAsync } from '@/lib/container/proxmox/client';

/**
 * GET /api/proxmox/template
 * Returns the current template status
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

    const proxmoxClient = await getProxmoxClientAsync();
    const templateManager = new ProxmoxTemplateManager(proxmoxClient);
    const status = await templateManager.getTemplateStatus();
    const sshPublicKey = templateManager.getSSHPublicKey();

    return NextResponse.json({
      ...status,
      sshKeyAvailable: !!sshPublicKey,
    });
  } catch (error) {
    console.error('Error getting template status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get template status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/proxmox/template
 * Create a new template or recreate existing one
 *
 * Body: {
 *   vmid?: number,     // Optional VMID for template (uses config default if not provided)
 *   storage?: string,  // Optional storage ID
 *   node?: string,     // Optional node (auto-selected if not provided)
 *   force?: boolean,   // Delete existing template first
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

    const body = await request.json().catch(() => ({}));
    const { vmid, storage, node, force } = body as {
      vmid?: number;
      storage?: string;
      node?: string;
      force?: boolean;
    };

    const proxmoxClient = await getProxmoxClientAsync();
    const templateManager = new ProxmoxTemplateManager(proxmoxClient);

    // Check SSH key availability
    const sshPublicKey = templateManager.getSSHPublicKey();
    if (!sshPublicKey) {
      return NextResponse.json(
        { error: 'No SSH public key found. Ensure SSH keys are mounted to the container.' },
        { status: 400 }
      );
    }

    // Check current status first
    const status = await templateManager.getTemplateStatus();

    // Determine VMID - use provided or configured starting VMID
    // status.vmid always has a value (the configured starting VMID or existing template VMID)
    const templateVmid = vmid || status.vmid;

    if (templateVmid === null) {
      return NextResponse.json(
        { error: 'No VMID provided and no configured starting VMID found' },
        { status: 400 }
      );
    }

    // If template exists and force is true, delete it first
    if (status.exists && force) {
      await templateManager.deleteTemplate(templateVmid);
    } else if (status.exists && !force) {
      return NextResponse.json(
        { error: 'Template already exists. Use force=true to recreate.' },
        { status: 409 }
      );
    }

    // Create template (this is a long-running operation)
    // For now, run synchronously. In production, this should be a background job.
    await templateManager.createTemplate(templateVmid, {
      storage,
      node: node || status.selectedNode || undefined,
    });

    return NextResponse.json({
      success: true,
      vmid: templateVmid,
      message: 'Template created successfully',
    });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create template' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/proxmox/template
 * Delete the existing template
 *
 * Query: ?vmid=150 (optional, uses config default)
 */
export async function DELETE(request: NextRequest) {
  try {
    // Check if Proxmox is configured
    if (config.container.backend !== 'proxmox') {
      return NextResponse.json(
        { error: 'Proxmox backend not configured' },
        { status: 400 }
      );
    }

    const proxmoxClient = await getProxmoxClientAsync();
    const templateManager = new ProxmoxTemplateManager(proxmoxClient);

    // Get VMID from query param, database, or config
    const { searchParams } = new URL(request.url);
    const vmidParam = searchParams.get('vmid');
    let vmid: number | null = vmidParam ? parseInt(vmidParam, 10) : null;

    if (!vmid) {
      vmid = await templateManager.getTemplateVmid();
    }

    if (!vmid) {
      return NextResponse.json(
        { error: 'No template VMID found' },
        { status: 400 }
      );
    }

    await templateManager.deleteTemplate(vmid);

    return NextResponse.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete template' },
      { status: 500 }
    );
  }
}
