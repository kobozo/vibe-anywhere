import { NextRequest } from 'next/server';
import { getRepositoryService, getWorkspaceService, getTabService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Verify user owns the tab through workspace -> repository chain
 */
async function verifyTabOwnership(tabId: string, userId: string) {
  const tabService = getTabService();
  const tab = await tabService.getTab(tabId);

  if (!tab) {
    throw new NotFoundError('Tab', tabId);
  }

  const workspaceService = getWorkspaceService();
  const workspace = await workspaceService.getWorkspace(tab.workspaceId);

  if (!workspace) {
    throw new NotFoundError('Tab', tabId);
  }

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(workspace.repositoryId);

  if (!repository || repository.userId !== userId) {
    throw new NotFoundError('Tab', tabId);
  }

  return { tab, workspace, repository };
}

/**
 * GET /api/tabs/[id] - Get a tab by ID
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const { tab, workspace } = await verifyTabOwnership(id, user.id);

  const tabService = getTabService();
  const workspaceService = getWorkspaceService();

  // Sync workspace container status
  await workspaceService.syncContainerStatus(workspace.id);

  // Re-fetch tab
  const updatedTab = await tabService.getTab(id);

  return successResponse({ tab: tabService.toTabInfo(updatedTab!) });
});

/**
 * POST /api/tabs/[id] - Start a tab
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  await verifyTabOwnership(id, user.id);

  const tabService = getTabService();
  const tab = await tabService.startTab(id);

  return successResponse({ tab: tabService.toTabInfo(tab) });
});

/**
 * DELETE /api/tabs/[id] - Stop and delete a tab
 */
export const DELETE = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  await verifyTabOwnership(id, user.id);

  const tabService = getTabService();
  await tabService.deleteTab(id);

  return successResponse({ success: true });
});
