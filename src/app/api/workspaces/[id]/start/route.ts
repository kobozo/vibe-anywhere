import { NextRequest } from 'next/server';
import { getRepositoryService, getWorkspaceService, getTabService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
  ValidationError,
  ApiRequestError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/workspaces/[id]/start - Start the workspace container
 * This starts the container if it's not already running
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

  // Check if container is already running
  if (workspace.containerStatus === 'running' && workspace.containerId) {
    throw new ValidationError('Container is already running');
  }

  // Only allow starting from valid states
  const startableStates = ['exited', 'none', 'dead', 'paused'];
  if (workspace.containerStatus && !startableStates.includes(workspace.containerStatus)) {
    throw new ValidationError(`Cannot start container in '${workspace.containerStatus}' state`);
  }

  // Start the container
  const updatedWorkspace = await workspaceService.startContainer(id);

  // Recover tabs that were stopped (from previous shutdown)
  const tabService = getTabService();
  const tabs = await tabService.listTabs(id);
  const stoppedTabs = tabs.filter(t => t.tabType === 'terminal' && t.status === 'stopped');

  // Set stopped tabs back to running so they can be reconnected
  for (const tab of stoppedTabs) {
    await tabService.updateTab(tab.id, { status: 'running' });
  }

  return successResponse({
    workspace: {
      id: updatedWorkspace.id,
      containerId: updatedWorkspace.containerId,
      containerStatus: updatedWorkspace.containerStatus,
    },
    tabsRecovered: stoppedTabs.map(t => t.id),
    message: 'Container started successfully',
  });
});
