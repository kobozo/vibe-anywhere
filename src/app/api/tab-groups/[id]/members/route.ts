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

const updatePaneSizesSchema = z.object({
  sizes: z.array(z.object({
    tabId: z.string().uuid(),
    sizePercent: z.number().min(10).max(90),
  })),
});

const addTabSchema = z.object({
  tabId: z.string().uuid(),
});

const removeTabSchema = z.object({
  tabId: z.string().uuid(),
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
 * PATCH /api/tab-groups/[id]/members - Update pane sizes or add/remove tabs
 */
export const PATCH = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();

  await verifyGroupAccess(user.id, id);

  const tabGroupService = getTabGroupService();

  // Try to parse as updatePaneSizes
  const sizesResult = updatePaneSizesSchema.safeParse(body);
  if (sizesResult.success) {
    const updatedGroup = await tabGroupService.updatePaneSizes(id, sizesResult.data.sizes);
    return successResponse({ group: updatedGroup });
  }

  // Try to parse as addTab
  const addResult = addTabSchema.safeParse(body);
  if (addResult.success && body.action === 'add') {
    const updatedGroup = await tabGroupService.addTabToGroup(id, addResult.data.tabId);
    return successResponse({ group: updatedGroup });
  }

  // Try to parse as removeTab
  const removeResult = removeTabSchema.safeParse(body);
  if (removeResult.success && body.action === 'remove') {
    const updatedGroup = await tabGroupService.removeTabFromGroup(id, removeResult.data.tabId);
    return successResponse({ group: updatedGroup, disbanded: updatedGroup === null });
  }

  throw new ValidationError('Invalid request body', {
    message: 'Must provide either sizes array, or tabId with action (add/remove)',
  });
});
