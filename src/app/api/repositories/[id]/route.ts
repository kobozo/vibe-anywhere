import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositoryService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
  ValidationError,
} from '@/lib/api-utils';

// Valid tech stack IDs
const validTechStacks = ['nodejs', 'python', 'go', 'rust', 'docker'] as const;

const updateRepositorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable().transform(v => v ?? undefined),
  templateId: z.string().uuid().optional().nullable(),
  techStack: z.array(z.enum(validTechStacks)).optional(),
  sshKeyId: z.string().uuid().optional().nullable(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/repositories/[id] - Get a repository by ID
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  // Get branches for the repository
  const branches = await repoService.getBranches(id);

  return successResponse({ repository, branches });
});

/**
 * DELETE /api/repositories/[id] - Delete a repository
 */
export const DELETE = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  await repoService.deleteRepository(id);

  return successResponse({ success: true });
});

/**
 * PATCH /api/repositories/[id] - Update a repository
 */
export const PATCH = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();

  const result = updateRepositorySchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  const updated = await repoService.updateRepository(id, result.data);

  return successResponse({ repository: updated });
});
