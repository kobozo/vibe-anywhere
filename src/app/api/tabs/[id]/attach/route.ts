import { NextRequest } from 'next/server';
import { getRepositoryService, getWorkspaceService, getTabService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
  ApiRequestError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tabs/[id]/attach - Prepare a tab for WebSocket attachment
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const tabService = getTabService();
  const tab = await tabService.getTab(id);

  if (!tab) {
    throw new NotFoundError('Tab', id);
  }

  // Verify ownership through workspace -> repository chain
  const workspaceService = await getWorkspaceService();
  const workspace = await workspaceService.getWorkspace(tab.workspaceId);

  if (!workspace) {
    throw new NotFoundError('Tab', id);
  }

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(workspace.repositoryId);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Tab', id);
  }

  // Check tab status
  if (tab.status !== 'running') {
    throw new ApiRequestError(
      `Tab is not running (current status: ${tab.status})`,
      'TAB_NOT_RUNNING',
      400
    );
  }

  // Return tab info for WebSocket connection
  // Container is now on the workspace, not the tab
  return successResponse({
    tabId: tab.id,
    containerId: workspace.containerId,
    workspaceId: workspace.id,
    repositoryId: repository.id,
  });
});
