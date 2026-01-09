import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplateService } from '@/lib/services/template-service';
import { ProxmoxTemplateManager } from '@/lib/container/proxmox/template-manager';
import { getProxmoxClientAsync } from '@/lib/container/proxmox/client';
import { config } from '@/lib/config';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ValidationError,
  NotFoundError,
} from '@/lib/api-utils';

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/templates/[id] - Get a template by ID
 */
export const GET = withErrorHandling(
  async (request: NextRequest, context: unknown) => {
    const user = await requireAuth(request);
    const { id } = await (context as RouteContext).params;

    const templateService = getTemplateService();
    const template = await templateService.getTemplate(id);

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    // Verify ownership
    if (template.userId !== user.id) {
      throw new NotFoundError('Template not found');
    }

    return successResponse({ template });
  }
);

/**
 * PATCH /api/templates/[id] - Update a template
 */
export const PATCH = withErrorHandling(
  async (request: NextRequest, context: unknown) => {
    const user = await requireAuth(request);
    const { id } = await (context as RouteContext).params;
    const body = await request.json();

    const result = updateTemplateSchema.safeParse(body);
    if (!result.success) {
      throw new ValidationError('Invalid request body', result.error.flatten());
    }

    const templateService = getTemplateService();
    const existing = await templateService.getTemplate(id);

    if (!existing) {
      throw new NotFoundError('Template not found');
    }

    // Verify ownership
    if (existing.userId !== user.id) {
      throw new NotFoundError('Template not found');
    }

    const template = await templateService.updateTemplate(id, result.data);

    return successResponse({ template });
  }
);

/**
 * DELETE /api/templates/[id] - Delete a template
 * Also deletes from Proxmox if the template was provisioned
 */
export const DELETE = withErrorHandling(
  async (request: NextRequest, context: unknown) => {
    const user = await requireAuth(request);
    const { id } = await (context as RouteContext).params;

    const templateService = getTemplateService();
    const existing = await templateService.getTemplate(id);

    if (!existing) {
      throw new NotFoundError('Template not found');
    }

    // Verify ownership
    if (existing.userId !== user.id) {
      throw new NotFoundError('Template not found');
    }

    // If template was provisioned on Proxmox, delete it there first
    if (existing.vmid && config.container.backend === 'proxmox') {
      try {
        // Get Proxmox client with database configuration
        const proxmoxClient = await getProxmoxClientAsync();
        const templateManager = new ProxmoxTemplateManager(proxmoxClient);
        // Use deleteProxmoxTemplate which just deletes from Proxmox without clearing old settings
        await templateManager.deleteProxmoxTemplate(existing.vmid);
        console.log(`Deleted Proxmox template VMID ${existing.vmid}`);
      } catch (error) {
        // Log but don't fail if Proxmox deletion fails (template might already be deleted)
        console.error(`Failed to delete Proxmox template VMID ${existing.vmid}:`, error);
      }
    }

    // Delete from database (also resets repositories to default template)
    await templateService.deleteTemplate(id);

    return successResponse({ message: 'Template deleted' });
  }
);
