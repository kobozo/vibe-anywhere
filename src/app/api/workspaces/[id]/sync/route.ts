import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceService } from '@/lib/services/workspace-service';
import { requireAuth, withErrorHandling, NotFoundError, successResponse } from '@/lib/api-utils';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/workspaces/:id/sync - Check git status in container
 * NOTE: Previously this synced changes back to host. Now it just checks git status
 * since repositories are cloned directly in containers and changes must be pushed.
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id: workspaceId } = await (context as RouteContext).params;
  const workspaceService = await getWorkspaceService();

  const workspace = await workspaceService.getWorkspace(workspaceId);
  if (!workspace) {
    throw new NotFoundError('Workspace', workspaceId);
  }

  // Check for uncommitted changes in container
  const status = await workspaceService.checkUncommittedChanges(workspaceId);

  return successResponse({
    message: status.hasChanges
      ? 'Workspace has uncommitted changes. Push to remote to persist.'
      : 'Workspace is clean.',
    status,
  });
});
