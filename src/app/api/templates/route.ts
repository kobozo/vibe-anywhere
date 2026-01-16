import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplateService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/api-utils';
import { TECH_STACKS } from '@/lib/container/proxmox/tech-stacks';

// Valid tech stack IDs - dynamically from tech-stacks.ts
const validTechStackIds = TECH_STACKS.map(s => s.id) as [string, ...string[]];

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  techStacks: z.array(z.enum(validTechStackIds)).optional().default([]),
  isDefault: z.boolean().optional().default(false),
  parentTemplateId: z.string().uuid().optional(), // Clone from this parent template (Vibe Anywhere template)
  baseCtTemplate: z.string().max(100).optional(), // CT template to use as base (e.g., 'debian-12-standard')
});

/**
 * GET /api/templates - List templates based on user role
 * - admin/template-admin: See all templates
 * - other roles: See only their own templates
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const templateService = getTemplateService();

  // Pass user ID and role to service for proper filtering
  const templates = await templateService.listTemplates(user.id, user.role);

  return successResponse({ templates });
});

/**
 * POST /api/templates - Create a new template record (pre-provisioning)
 * - admin: Can create templates
 * - template-admin: Can create templates
 * - developers: Can create personal templates
 * - other roles: Can create personal templates
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  console.log('[API /api/templates POST] Request received');
  const user = await requireAuth(request);
  console.log('[API /api/templates POST] Auth passed, user:', user.id);
  const body = await request.json();
  console.log('[API /api/templates POST] Body:', JSON.stringify(body));

  const result = createTemplateSchema.safeParse(body);
  console.log('[API /api/templates POST] Validation result:', result.success);
  if (!result.success) {
    console.log('[API /api/templates POST] Validation errors:', result.error);
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  console.log('[API /api/templates POST] Calling templateService.createTemplate');
  const templateService = getTemplateService();
  console.log('[API /api/templates POST] Got template service instance');

  // All authenticated users can create templates (personal templates)
  try {
    console.log('[API /api/templates POST] About to call createTemplate with data:', {
      userId: user.id,
      name: result.data.name,
      description: result.data.description,
      techStacks: result.data.techStacks,
      techStacksType: typeof result.data.techStacks,
      techStacksIsArray: Array.isArray(result.data.techStacks),
      isDefault: result.data.isDefault,
      parentTemplateId: result.data.parentTemplateId,
      baseCtTemplate: result.data.baseCtTemplate,
    });

    console.log('[API /api/templates POST] Calling method NOW...');
    let template;
    try {
      template = await templateService.createTemplate(user.id, {
        name: result.data.name,
        description: result.data.description,
        techStacks: result.data.techStacks,
        isDefault: result.data.isDefault,
        parentTemplateId: result.data.parentTemplateId,
        baseCtTemplate: result.data.baseCtTemplate,
      });
    } catch (innerError: any) {
      console.error('[API /api/templates POST] INNER CATCH - Error during createTemplate call:', innerError?.message);
      console.error('[API /api/templates POST] INNER CATCH - Full error:', innerError);
      throw innerError;
    }
    console.log('[API /api/templates POST] Template created successfully');
    return successResponse({ template }, 201);
  } catch (error: any) {
    console.error('[API /api/templates POST] OUTER CATCH - Error in createTemplate:', error);
    console.error('[API /api/templates POST] OUTER CATCH - Error stack:', error?.stack);
    console.error('[API /api/templates POST] OUTER CATCH - Error name:', error?.name);
    console.error('[API /api/templates POST] OUTER CATCH - Error message:', error?.message);
    throw error;
  }
});
