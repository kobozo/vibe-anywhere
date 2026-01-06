import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositoryService, getWorkspaceService } from '@/lib/services';
import { getTabGroupService } from '@/lib/services/tab-group-service';
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

const createTabGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  tabIds: z.array(z.string().uuid()).min(2, 'At least 2 tabs required').max(4, 'Maximum 4 tabs allowed'),
  layout: z.enum(['horizontal', 'vertical', 'left-stack', 'right-stack', 'grid-2x2']).optional(),
});

/**
 * GET /api/workspaces/[id]/tab-groups - List tab groups for a workspace
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const workspaceService = await getWorkspaceService();
  const workspace = await workspaceService.getWorkspace(id);

  if (!workspace) {
    throw new NotFoundError('Workspace', id);
  }

  // Verify ownership through repository
  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(workspace.repositoryId);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Workspace', id);
  }

  const tabGroupService = getTabGroupService();
  const groups = await tabGroupService.listGroups(id);

  return successResponse({ groups });
});

/**
 * POST /api/workspaces/[id]/tab-groups - Create a new tab group
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();

  const result = createTabGroupSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const workspaceService = await getWorkspaceService();
  const workspace = await workspaceService.getWorkspace(id);

  if (!workspace) {
    throw new NotFoundError('Workspace', id);
  }

  // Verify ownership through repository
  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(workspace.repositoryId);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Workspace', id);
  }

  const tabGroupService = getTabGroupService();
  const group = await tabGroupService.createGroup(id, {
    name: result.data.name,
    tabIds: result.data.tabIds,
    layout: result.data.layout,
  });

  return successResponse({ group }, 201);
});
