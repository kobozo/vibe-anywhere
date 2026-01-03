import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositoryService, getWorkspaceService } from '@/lib/services';
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

const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  branchName: z.string().regex(/^[a-zA-Z0-9/_-]+$/, 'Invalid branch name'),
  baseBranch: z.string().optional(),
});

/**
 * GET /api/repositories/[id]/workspaces - List workspaces for a repository
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  const workspaceService = getWorkspaceService();
  const workspaces = await workspaceService.listWorkspaces(id);

  return successResponse({ workspaces });
});

/**
 * POST /api/repositories/[id]/workspaces - Create a new workspace
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();

  const result = createWorkspaceSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  const workspaceService = getWorkspaceService();
  const workspace = await workspaceService.createWorkspace(id, result.data);

  return successResponse({ workspace }, 201);
});
