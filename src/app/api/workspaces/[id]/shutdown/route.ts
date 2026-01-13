import { NextRequest } from 'next/server';
import { getRepositoryService, getWorkspaceService, getTabService } from '@/lib/services';
import { getTabStreamManager } from '@/lib/services/tab-stream-manager';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
  ApiError,
  ApiRequestError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/workspaces/[id]/shutdown - Shutdown the workspace container
 * This stops the container (preserves filesystem) and sets all tabs to 'stopped' status
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const workspaceService = await getWorkspaceService();
  const workspace = await workspaceService.getWorkspace(id);

  if (!workspace) {
    throw new NotFoundError('Workspace', id);
  }

  // Check permission: owner, shared user with execute permission, or admin
  const permission = await workspaceService.checkWorkspacePermission(id, user.id, 'execute');
  if (!permission.hasPermission) {
    throw new ApiRequestError('You don\'t have permission to perform this action', 'FORBIDDEN', 403);
  }

  // Verify container exists and is running
  if (!workspace.containerId || workspace.containerStatus !== 'running') {
    throw new ApiError(400, 'Container is not running');
  }

  // Get all terminal tabs for this workspace that are running
  const tabService = getTabService();
  const tabs = await tabService.listTabs(id);
  const terminalTabs = tabs.filter(t => t.tabType === 'terminal' && t.status === 'running');

  // Close all tab streams first (they will be lost due to container shutdown)
  const tabStreamManager = getTabStreamManager();
  await tabStreamManager.closeAllForWorkspace(id);

  // Stop the container
  try {
    await workspaceService.stopContainer(id);
  } catch (error) {
    // Container stop failed - tabs remain in current status, users can reconnect
    throw error;
  }

  // Only set tabs to 'stopped' status after successful container stop
  for (const tab of terminalTabs) {
    await tabService.updateTab(tab.id, { status: 'stopped' });
  }

  return successResponse({
    workspace: {
      id: workspace.id,
      containerId: workspace.containerId,
      containerStatus: 'exited',
    },
    tabsStopped: terminalTabs.map(t => t.id),
    message: 'Container shutdown complete. Start the container to resume.',
  });
});
