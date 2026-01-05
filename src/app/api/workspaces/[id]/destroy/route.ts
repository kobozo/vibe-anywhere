import { NextRequest, NextResponse } from 'next/server';
import { getRepositoryService, getWorkspaceService } from '@/lib/services';
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
 * POST /api/workspaces/[id]/destroy - Destroy the workspace container
 * This stops and removes the container but keeps the workspace record.
 * The container can be recreated by starting a tab.
 *
 * Query params:
 *   - force: "true" to skip uncommitted changes check
 *
 * Returns 409 Conflict if workspace has uncommitted changes (unless force=true)
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  // Check for force flag
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

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

  // Check for uncommitted changes if not forcing and container is running
  if (!force && workspace.containerId && workspace.containerIp) {
    const status = await workspaceService.checkUncommittedChanges(id);

    if (status.hasChanges) {
      return NextResponse.json(
        {
          error: 'UNCOMMITTED_CHANGES',
          message: 'Workspace has uncommitted changes that will be lost if you destroy the container.',
          details: {
            staged: status.staged,
            modified: status.modified,
            untracked: status.untracked,
          },
        },
        { status: 409 }
      );
    }
  }

  // Close all tab streams for this workspace
  const tabStreamManager = getTabStreamManager();
  tabStreamManager.closeAllForWorkspace(id);

  // Destroy the container (keeps workspace record)
  const updatedWorkspace = await workspaceService.destroyContainer(id);

  return successResponse({
    workspace: {
      id: updatedWorkspace.id,
      containerId: updatedWorkspace.containerId,
      containerStatus: updatedWorkspace.containerStatus,
    },
    message: 'Container destroyed. Start a tab to create a new container.',
  });
});
