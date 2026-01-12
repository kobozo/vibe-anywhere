import { NextRequest } from 'next/server';
import { getWorkspaceService, getRepositoryService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
  ApiRequestError,
  ValidationError,
} from '@/lib/api-utils';
import { isAdmin } from '@/lib/permissions';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/workspaces/[id]/share - Share a workspace with another user
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const body = await request.json();
  const { sharedWithUsername, permissions } = body;

  // Validate request body
  if (!sharedWithUsername || typeof sharedWithUsername !== 'string') {
    throw new ValidationError('sharedWithUsername is required and must be a string');
  }
  if (!permissions || !Array.isArray(permissions)) {
    throw new ValidationError('permissions is required and must be an array');
  }

  const workspaceService = await getWorkspaceService();
  const workspace = await workspaceService.getWorkspace(id);

  if (!workspace) {
    throw new NotFoundError('Workspace', id);
  }

  // Verify ownership through repository OR admin
  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(workspace.repositoryId);

  if (!repository) {
    throw new NotFoundError('Workspace', id);
  }

  const isOwner = repository.userId === user.id;
  const isAdminUser = isAdmin(user);

  if (!isOwner && !isAdminUser) {
    throw new ApiRequestError('You do not have permission to share this workspace', 'FORBIDDEN', 403);
  }

  // Share the workspace
  const share = await workspaceService.shareWorkspace(
    id,
    user.id,
    sharedWithUsername,
    permissions
  );

  return successResponse(share, 201);
});

/**
 * GET /api/workspaces/[id]/shares - List all shares for a workspace
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const workspaceService = await getWorkspaceService();
  const shares = await workspaceService.listWorkspaceShares(id, user.id);

  return successResponse(shares);
});
