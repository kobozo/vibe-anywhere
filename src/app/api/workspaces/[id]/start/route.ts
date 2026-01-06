import { NextRequest } from 'next/server';
import { getRepositoryService, getWorkspaceService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
  ValidationError,
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

  // Verify ownership through repository
  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(workspace.repositoryId);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Workspace', id);
  }

  // Check if container is already running
  if (workspace.containerStatus === 'running' && workspace.containerId) {
    throw new ValidationError('Container is already running');
  }

  // Start the container
  const updatedWorkspace = await workspaceService.startContainer(id);

  return successResponse({
    workspace: {
      id: updatedWorkspace.id,
      containerId: updatedWorkspace.containerId,
      containerStatus: updatedWorkspace.containerStatus,
    },
    message: 'Container started successfully',
  });
});
