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
import { getSettingsService } from '@/lib/services/settings-service';
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
  const { storage, node, staging } = body as {
    storage?: string;
    node?: string;
    staging?: boolean;
  };

  const templateManager = getProxmoxTemplateManager();
  const settingsService = getSettingsService();

  // Get default storage from settings
  const proxmoxSettings = await settingsService.getProxmoxSettings();
  const defaultStorage = proxmoxSettings.defaultStorage || config.proxmox.storage || 'local-lvm';

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

      // Track VMID for cleanup on failure
      let allocatedVmid: number | null = null;

      try {
        // Update template status to provisioning
        await templateService.updateTemplateStatus(id, 'provisioning');

        // Allocate a VMID for this template
        const templateVmid = await templateService.allocateTemplateVmid();
        allocatedVmid = templateVmid;
        sendEvent('progress', { step: 'init', progress: 0, message: `Allocated VMID ${templateVmid}` });

        // Get parent VMID if this template is based on another
        let parentVmid: number | undefined;
        if (template.parentTemplateId) {
          const fetchedParentVmid = await templateService.getParentVmid(id);
          if (!fetchedParentVmid) {
            throw new Error('Parent template VMID not found');
          }
          parentVmid = fetchedParentVmid;
          sendEvent('progress', { step: 'init', progress: 2, message: `Cloning from parent template VMID ${parentVmid}` });
        }

        // Get available nodes
        const status = await templateManager.getTemplateStatus();
        const targetNode = node || status.selectedNode || undefined;

        // Create template with progress updates and log streaming
        const result = await templateManager.createTemplate(templateVmid, {
          name: template.name,
          storage,
          node: targetNode,
          techStacks: template.techStacks || [], // Only NEW stacks (service already filtered inherited ones)
          stopAtStaging: staging,
          parentVmid, // Clone from parent if specified
          baseCtTemplate: template.baseCtTemplate || undefined, // CT template to use as base
          onProgress: (progress) => {
            sendEvent('progress', progress);
          },
          onLog: (type, content) => {
            sendEvent('log', { type, content, timestamp: Date.now() });
          },
        });

        // Handle staging mode vs full provisioning
        if (staging && result.containerIp) {
          // Template is in staging mode - container is running for manual customization
          await templateService.updateTemplateStatus(
            id,
            'staging',
            templateVmid,
            targetNode || status.selectedNode || undefined,
            storage || defaultStorage,
            undefined,
            result.containerIp
          );

          sendEvent('staging', {
            success: true,
            vmid: templateVmid,
            containerIp: result.containerIp,
            message: 'Container ready for staging customization',
          });
        } else {
          // Update template record with success
          await templateService.updateTemplateStatus(
            id,
            'ready',
            templateVmid,
            targetNode || status.selectedNode || undefined,
            storage || defaultStorage
          );

          sendEvent('complete', {
            success: true,
            vmid: templateVmid,
            message: 'Template provisioned successfully',
          });
        }
      } catch (error) {
        console.error('Template provisioning error:', error);

        // Clean up the Proxmox container if it was created
        if (allocatedVmid) {
          try {
            sendEvent('progress', { step: 'cleanup', progress: 0, message: 'Cleaning up failed container...' });
            await templateManager.deleteProxmoxTemplate(allocatedVmid);
            console.log(`Cleaned up failed template container VMID ${allocatedVmid}`);
          } catch (cleanupError) {
            // Log but don't fail - container might not have been created yet
            console.warn(`Failed to cleanup container VMID ${allocatedVmid}:`, cleanupError);
          }
        }

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
