/**
 * Template Provisioning Stream API
 *
 * POST /api/templates/[id]/provision - Provision a template with SSE progress updates
 *
 * This endpoint streams progress updates during template provisioning on Proxmox.
 */

import { NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { getProxmoxTemplateManager } from '@/lib/container/proxmox/template-manager';
import { getTemplateService } from '@/lib/services/template-service';
import { requireAuth } from '@/lib/api-utils';

/**
 * POST /api/templates/[id]/provision
 * Provision a template on Proxmox with streaming progress updates
 *
 * Body: {
 *   storage?: string,
 *   node?: string,
 * }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Authenticate
  let user;
  try {
    user = await requireAuth(request);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { id } = await context.params;

  // Check if Proxmox is configured
  if (config.container.backend !== 'proxmox') {
    return new Response(
      JSON.stringify({ error: 'Proxmox backend not configured' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get template record
  const templateService = getTemplateService();
  const template = await templateService.getTemplate(id);

  if (!template) {
    return new Response(
      JSON.stringify({ error: 'Template not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify ownership
  if (template.userId !== user.id) {
    return new Response(
      JSON.stringify({ error: 'Template not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check if already provisioned
  if (template.status === 'ready' && template.vmid) {
    return new Response(
      JSON.stringify({ error: 'Template already provisioned. Use recreate endpoint to recreate.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { storage, node } = body as {
    storage?: string;
    node?: string;
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
        // Update template status to provisioning
        await templateService.updateTemplateStatus(id, 'provisioning');

        // Allocate a VMID for this template
        const templateVmid = await templateService.allocateTemplateVmid();
        sendEvent('progress', { step: 'init', progress: 0, message: `Allocated VMID ${templateVmid}` });

        // Get available nodes
        const status = await templateManager.getTemplateStatus();
        const targetNode = node || status.selectedNode || undefined;

        // Create template with progress updates
        await templateManager.createTemplate(templateVmid, {
          name: template.name,
          storage,
          node: targetNode,
          techStacks: template.techStacks || [],
          onProgress: (progress) => {
            sendEvent('progress', progress);
          },
        });

        // Update template record with success
        await templateService.updateTemplateStatus(
          id,
          'ready',
          templateVmid,
          targetNode || status.selectedNode || undefined,
          storage || 'local'
        );

        sendEvent('complete', {
          success: true,
          vmid: templateVmid,
          message: 'Template provisioned successfully',
        });
      } catch (error) {
        console.error('Template provisioning error:', error);

        // Update template status to error
        await templateService.updateTemplateStatus(
          id,
          'error',
          undefined,
          undefined,
          undefined,
          error instanceof Error ? error.message : 'Failed to provision template'
        );

        sendEvent('error', {
          message: error instanceof Error ? error.message : 'Failed to provision template',
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
