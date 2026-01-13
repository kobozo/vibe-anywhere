import { NextRequest } from 'next/server';
import { getRepositoryService, getWorkspaceService } from '@/lib/services';
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
 * GET /api/workspaces/[id] - Get a workspace by ID
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const workspaceService = await getWorkspaceService();
  const workspace = await workspaceService.getWorkspace(id);

  if (!workspace) {
    throw new NotFoundError('Workspace', id);
  }

  // Check permission: owner, shared user with view permission, or admin
  const permission = await workspaceService.checkWorkspacePermission(id, user.id, 'view');
  if (!permission.hasPermission) {
    throw new ApiRequestError('You don\'t have permission to perform this action', 'FORBIDDEN', 403);
  }

  // Get git status
  let gitStatus = null;
  try {
    gitStatus = await workspaceService.getGitStatus(id);
  } catch (error) {
    console.error('Failed to get git status:', error);
  }

  return successResponse({ workspace, gitStatus });
});

/**
 * DELETE /api/workspaces/[id] - Delete a workspace
 */
export const DELETE = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const workspaceService = await getWorkspaceService();
  const workspace = await workspaceService.getWorkspace(id);

  if (!workspace) {
    throw new NotFoundError('Workspace', id);
  }

  // Check permission: only owner or admin can delete
  const permission = await workspaceService.checkWorkspacePermission(id, user.id, 'modify');
  if (!permission.hasPermission) {
    throw new ApiRequestError('You don\'t have permission to perform this action', 'FORBIDDEN', 403);
  }

  await workspaceService.deleteWorkspace(id);

  return successResponse({ success: true });
});
