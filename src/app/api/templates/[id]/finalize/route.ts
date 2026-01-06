/**
 * Template Finalize API
 *
 * POST /api/templates/[id]/finalize - Finalize a staging template
 *
 * This endpoint finalizes a staging template by stopping the container
 * and converting it to a Proxmox template.
 */

import { NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { getProxmoxTemplateManager } from '@/lib/container/proxmox/template-manager';
import { getTemplateService } from '@/lib/services/template-service';
import { requireAuth } from '@/lib/api-utils';

/**
 * POST /api/templates/[id]/finalize
 * Finalize a staging template with streaming progress updates
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

  // Check if template is in staging status
  if (template.status !== 'staging') {
    return new Response(
      JSON.stringify({ error: 'Template is not in staging status' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check if VMID is assigned
  if (!template.vmid) {
    return new Response(
      JSON.stringify({ error: 'Template has no VMID assigned' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const templateManager = getProxmoxTemplateManager();

  // Create a readable stream for SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        sendEvent('progress', { step: 'init', progress: 0, message: 'Starting finalization...' });

        // Finalize the template (run cleanup, stop container, convert to template)
        await templateManager.finalizeTemplate(template.vmid!, {
          node: template.node || undefined,
          containerIp: template.stagingContainerIp || undefined,
          onProgress: (progress) => {
            sendEvent('progress', progress);
          },
          onLog: (type, content) => {
            sendEvent('log', { type, content, timestamp: Date.now() });
          },
        });

        // Update template status to ready, clear staging IP
        await templateService.updateTemplateStatus(
          id,
          'ready',
          template.vmid ?? undefined,
          template.node || undefined,
          template.storage || undefined
        );
        await templateService.clearStagingState(id);

        sendEvent('complete', {
          success: true,
          vmid: template.vmid,
          message: 'Template finalized successfully',
        });
      } catch (error) {
        console.error('Template finalization error:', error);

        // Update template status to error
        await templateService.updateTemplateStatus(
          id,
          'error',
          template.vmid ?? undefined,
          template.node || undefined,
          template.storage || undefined,
          error instanceof Error ? error.message : 'Failed to finalize template'
        );

        sendEvent('error', {
          message: error instanceof Error ? error.message : 'Failed to finalize template',
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
