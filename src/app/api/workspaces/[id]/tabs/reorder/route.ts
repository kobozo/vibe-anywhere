import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositoryService, getWorkspaceService, getTabService } from '@/lib/services';
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

const sortOrderUpdateSchema = z.object({
  id: z.string().uuid(),
  sortOrder: z.number().int().min(0),
});

const reorderRequestSchema = z.object({
  tabs: z.array(sortOrderUpdateSchema).optional().default([]),
  groups: z.array(sortOrderUpdateSchema).optional().default([]),
});

/**
 * PATCH /api/workspaces/[id]/tabs/reorder - Batch update tab and group sort orders
 */
export const PATCH = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id: workspaceId } = await (context as RouteContext).params;
  const body = await request.json();

  const result = reorderRequestSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const { tabs: tabUpdates, groups: groupUpdates } = result.data;

  // Verify workspace exists and user has access
  const workspaceService = await getWorkspaceService();
  const workspace = await workspaceService.getWorkspace(workspaceId);

  if (!workspace) {
    throw new NotFoundError('Workspace', workspaceId);
  }

  // Verify ownership through repository
  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(workspace.repositoryId);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Workspace', workspaceId);
  }

  // Update tab sort orders
  const tabService = getTabService();
  if (tabUpdates.length > 0) {
    await tabService.batchUpdateSortOrder(workspaceId, tabUpdates);
  }

  // Update group sort orders
  const tabGroupService = getTabGroupService();
  if (groupUpdates.length > 0) {
    await tabGroupService.batchUpdateSortOrder(workspaceId, groupUpdates);
  }

  return successResponse({
    updatedTabs: tabUpdates.length,
    updatedGroups: groupUpdates.length,
  });
});
