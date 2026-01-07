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

const gitUrlPattern = /^(https?:\/\/[^\s]+|git@[^\s:]+:[^\s]+|ssh:\/\/[^\s]+)$/;

const updateRepositorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable().transform(v => v ?? undefined),
  cloneUrl: z.string().regex(gitUrlPattern, 'Invalid git URL').optional(),
  cloneDepth: z.number().int().positive().optional().nullable(),
  defaultBranch: z.string().min(1).max(100).optional(),
  templateId: z.string().uuid().optional().nullable(),
  techStack: z.array(z.enum(validTechStacks)).optional(),
  sshKeyId: z.string().uuid().optional().nullable(),
  // Resource overrides (null = use global defaults)
  resourceMemory: z.number().int().min(512).max(65536).nullable().optional(), // MB
  resourceCpuCores: z.number().int().min(1).max(32).nullable().optional(),
  resourceDiskSize: z.number().int().min(4).max(500).nullable().optional(), // GB
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

  // Get cached branches or fall back to default branch
  const cacheInfo = await repoService.getCachedBranches(id);
  const branches =
    cacheInfo.branches.length > 0
      ? cacheInfo.branches
      : repository.defaultBranch
        ? [repository.defaultBranch]
        : ['main'];

  return successResponse({
    repository,
    branches,
    branchesMeta: {
      cachedAt: cacheInfo.cachedAt?.toISOString() || null,
      isStale: cacheInfo.isStale,
    },
  });
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
