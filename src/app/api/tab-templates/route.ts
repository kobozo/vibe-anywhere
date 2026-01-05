import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTabTemplateService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/api-utils';

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  icon: z.string().optional(),
  command: z.string().min(1, 'Command is required'),
  args: z.array(z.string()).optional(),
  description: z.string().max(200).optional(),
  exitOnClose: z.boolean().optional(),
});

/**
 * GET /api/tab-templates - List all tab templates for the authenticated user
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const templateService = getTabTemplateService();

  const templates = await templateService.getTemplates(user.id);

  return successResponse({ templates });
});

/**
 * POST /api/tab-templates - Create a new tab template
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const body = await request.json();

  const result = createTemplateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const templateService = getTabTemplateService();
  const template = await templateService.createTemplate(user.id, result.data);

  return successResponse({ template }, 201);
});
