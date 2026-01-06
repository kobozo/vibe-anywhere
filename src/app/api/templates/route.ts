import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplateService } from '@/lib/services/template-service';
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
  parentTemplateId: z.string().uuid().optional(), // Clone from this parent template
});

/**
 * GET /api/templates - List all templates for the authenticated user
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const templateService = getTemplateService();

  const templates = await templateService.listTemplates(user.id);

  return successResponse({ templates });
});

/**
 * POST /api/templates - Create a new template record (pre-provisioning)
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const body = await request.json();

  const result = createTemplateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const templateService = getTemplateService();
  const template = await templateService.createTemplate(user.id, {
    name: result.data.name,
    description: result.data.description,
    techStacks: result.data.techStacks,
    isDefault: result.data.isDefault,
    parentTemplateId: result.data.parentTemplateId,
  });

  return successResponse({ template }, 201);
});
