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
 * POST /api/workspaces/[id]/restart - Restart the workspace container
 * This performs a true container restart (preserves state), then restarts all tabs
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

  // Set all terminal tabs to 'restarting' status
  for (const tab of terminalTabs) {
    await tabService.updateTab(tab.id, { status: 'restarting' });
  }

  // Close all tab streams (they will be lost due to container restart)
  const tabStreamManager = getTabStreamManager();
  await tabStreamManager.closeAllForWorkspace(id);

  // Perform the true restart
  try {
    await workspaceService.restartContainer(id);
  } catch (error) {
    // Revert tab statuses if restart failed
    for (const tab of terminalTabs) {
      await tabService.updateTab(tab.id, { status: 'stopped' });
    }
    throw error;
  }

  return successResponse({
    workspace: {
      id: workspace.id,
      containerId: workspace.containerId,
      containerStatus: workspace.containerStatus,
    },
    tabsRestarting: terminalTabs.map(t => t.id),
    message: 'Container restart initiated. Tabs will be restarted automatically.',
  });
});
