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

const updateTabGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  layout: z.enum(['horizontal', 'vertical', 'left-stack', 'right-stack', 'grid-2x2']).optional(),
});

/**
 * Verify user has access to a tab group
 */
async function verifyGroupAccess(userId: string, groupId: string) {
  const tabGroupService = getTabGroupService();
  const group = await tabGroupService.getGroup(groupId);

  if (!group) {
    throw new NotFoundError('Tab group', groupId);
  }

  const workspaceService = await getWorkspaceService();
  const workspace = await workspaceService.getWorkspace(group.workspaceId);

  if (!workspace) {
    throw new NotFoundError('Workspace', group.workspaceId);
  }

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(workspace.repositoryId);

  if (!repository || repository.userId !== userId) {
    throw new NotFoundError('Tab group', groupId);
  }

  return group;
}

/**
 * GET /api/tab-groups/[id] - Get a tab group
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const group = await verifyGroupAccess(user.id, id);

  return successResponse({ group });
});

/**
 * PATCH /api/tab-groups/[id] - Update a tab group
 */
export const PATCH = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();

  const result = updateTabGroupSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  await verifyGroupAccess(user.id, id);

  const tabGroupService = getTabGroupService();
  const updatedGroup = await tabGroupService.updateGroup(id, result.data);

  return successResponse({ group: updatedGroup });
});

/**
 * DELETE /api/tab-groups/[id] - Delete a tab group (tabs preserved)
 */
export const DELETE = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  await verifyGroupAccess(user.id, id);

  const tabGroupService = getTabGroupService();
  await tabGroupService.deleteGroup(id);

  return successResponse({ success: true });
});
