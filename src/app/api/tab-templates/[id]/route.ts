import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTabTemplateService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ValidationError,
  NotFoundError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  icon: z.string().optional(),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  description: z.string().max(200).optional(),
  exitOnClose: z.boolean().optional(),
  requiredTechStack: z.string().nullable().optional(),
});

/**
 * PATCH /api/tab-templates/:id - Update a tab template
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

    const templateService = getTabTemplateService();

    // Verify template exists and belongs to user
    const existing = await templateService.getTemplate(id);
    if (!existing) {
      throw new NotFoundError('Template not found');
    }
    if (existing.userId !== user.id) {
      throw new NotFoundError('Template not found');
    }

    const template = await templateService.updateTemplate(id, result.data);

    return successResponse({ template });
  }
);

/**
 * DELETE /api/tab-templates/:id - Delete a tab template
 */
export const DELETE = withErrorHandling(
  async (request: NextRequest, context: unknown) => {
    const user = await requireAuth(request);
    const { id } = await (context as RouteContext).params;

    const templateService = getTabTemplateService();

    // Verify template exists and belongs to user
    const existing = await templateService.getTemplate(id);
    if (!existing) {
      throw new NotFoundError('Template not found');
    }
    if (existing.userId !== user.id) {
      throw new NotFoundError('Template not found');
    }

    await templateService.deleteTemplate(id);

    return successResponse({ success: true });
  }
);
