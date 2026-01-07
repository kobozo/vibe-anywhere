import { NextRequest } from 'next/server';
import { getRepositoryService, getWorkspaceService, getTabService } from '@/lib/services';
import { getTabStreamManager } from '@/lib/services/tab-stream-manager';
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
 * POST /api/workspaces/[id]/redeploy - Redeploy the workspace container
 * This stops all running tab streams, removes the container, and recreates it
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
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

  // Stop all tab streams for this workspace
  const tabStreamManager = getTabStreamManager();
  await tabStreamManager.closeAllForWorkspace(id);

  // Delete all tabs except Dashboard (tab groups also deleted)
  const tabService = getTabService();
  await tabService.deleteAllTabsExceptDashboard(id);

  // Destroy the container completely so startContainer creates a fresh one
  if (workspace.containerId) {
    try {
      await workspaceService.destroyContainer(id);
    } catch (error) {
      console.error('Error destroying container:', error);
    }
  }

  // Start a fresh container (will create new since container was destroyed)
  const updatedWorkspace = await workspaceService.startContainer(id);

  return successResponse({
    workspace: {
      id: updatedWorkspace.id,
      containerId: updatedWorkspace.containerId,
      containerStatus: updatedWorkspace.containerStatus,
    },
    message: 'Container redeployed successfully. Tabs need to be restarted.',
  });
});
