/**
 * Proxmox Template Creation Stream API
 *
 * POST /api/proxmox/template/stream - Create template with SSE progress updates
 *
 * This endpoint streams progress updates during template creation.
 */

import { NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { getProxmoxTemplateManager } from '@/lib/container/proxmox/template-manager';

/**
 * POST /api/proxmox/template/stream
 * Create a new template with streaming progress updates
 *
 * Body: {
 *   vmid?: number,
 *   storage?: string,
 *   node?: string,
 *   force?: boolean,
 * }
 */
export async function POST(request: NextRequest) {
  // Check if Proxmox is configured
  if (config.container.backend !== 'proxmox') {
    return new Response(
      JSON.stringify({ error: 'Proxmox backend not configured' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { vmid, storage, node, force, techStacks, customPostInstallScript } = body as {
    vmid?: number;
    storage?: string;
    node?: string;
    force?: boolean;
    techStacks?: string[];
    customPostInstallScript?: string;
  };

  const templateManager = getProxmoxTemplateManager();

  // Check SSH key availability
  const sshPublicKey = templateManager.getSSHPublicKey();
  if (!sshPublicKey) {
    return new Response(
      JSON.stringify({ error: 'No SSH public key found. Ensure SSH keys are mounted to the container.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Check current status first
        const status = await templateManager.getTemplateStatus();

        // Determine VMID - use provided, existing, or configured starting VMID
        // status.vmid always has a value (the configured starting VMID or existing template VMID)
        const templateVmid = vmid || status.vmid;

        if (templateVmid === null) {
          sendEvent('error', { message: 'No VMID provided and no configured starting VMID found' });
          controller.close();
          return;
        }

        // If template exists and force is true, delete it first
        if (status.exists && force) {
          sendEvent('progress', { step: 'delete', progress: 0, message: 'Deleting existing template...' });
          await templateManager.deleteTemplate(templateVmid);
          sendEvent('progress', { step: 'delete', progress: 5, message: 'Existing template deleted' });
        } else if (status.exists && !force) {
          sendEvent('error', { message: 'Template already exists. Use force=true to recreate.' });
          controller.close();
          return;
        }

        // Create template with progress updates
        await templateManager.createTemplate(templateVmid, {
          storage,
          node: node || status.selectedNode || undefined,
          techStacks: techStacks || [],
          customPostInstallScript,
          onProgress: (progress) => {
            sendEvent('progress', progress);
          },
        });

        sendEvent('complete', {
          success: true,
          vmid: templateVmid,
          message: 'Template created successfully',
        });
      } catch (error) {
        console.error('Template creation error:', error);
        sendEvent('error', {
          message: error instanceof Error ? error.message : 'Failed to create template',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
