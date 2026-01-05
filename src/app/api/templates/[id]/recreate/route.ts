/**
 * Template Recreation Stream API
 *
 * POST /api/templates/[id]/recreate - Recreate a template with SSE progress updates
 *
 * This endpoint deletes the existing template and recreates it with the same VMID.
 */

import { NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { getProxmoxTemplateManager } from '@/lib/container/proxmox/template-manager';
import { getTemplateService } from '@/lib/services/template-service';
import { requireAuth } from '@/lib/api-utils';

/**
 * POST /api/templates/[id]/recreate
 * Recreate an existing template (keeps same VMID)
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

  // Must have a VMID to recreate
  if (!template.vmid) {
    return new Response(
      JSON.stringify({ error: 'Template has not been provisioned yet. Use provision endpoint.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

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
  const templateVmid = template.vmid;
  const targetNode = template.node || undefined;
  const targetStorage = template.storage || 'local';

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Update template status to provisioning
        await templateService.updateTemplateStatus(id, 'provisioning');

        // Delete existing template
        sendEvent('progress', { step: 'delete', progress: 0, message: 'Deleting existing template...' });
        try {
          await templateManager.deleteTemplate(templateVmid);
          sendEvent('progress', { step: 'delete', progress: 5, message: 'Existing template deleted' });
        } catch (deleteError) {
          // Template might not exist in Proxmox, continue anyway
          console.warn('Could not delete template:', deleteError);
          sendEvent('progress', { step: 'delete', progress: 5, message: 'Template not found in Proxmox, continuing...' });
        }

        // Recreate template with progress updates (same VMID)
        await templateManager.createTemplate(templateVmid, {
          storage: targetStorage,
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
          targetNode,
          targetStorage
        );

        sendEvent('complete', {
          success: true,
          vmid: templateVmid,
          message: 'Template recreated successfully',
        });
      } catch (error) {
        console.error('Template recreation error:', error);

        // Update template status to error
        await templateService.updateTemplateStatus(
          id,
          'error',
          templateVmid, // Keep the VMID even on error
          targetNode,
          targetStorage,
          error instanceof Error ? error.message : 'Failed to recreate template'
        );

        sendEvent('error', {
          message: error instanceof Error ? error.message : 'Failed to recreate template',
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
