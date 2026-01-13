import { NextRequest } from 'next/server';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ApiRequestError,
} from '@/lib/api-utils';
import { canManageUsers } from '@/lib/permissions';
import { getAuthService } from '@/lib/services';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/users/[id]/resources
 * Get count of repositories and workspaces owned by a user
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  // Require authentication and permission to manage users
  const user = await requireAuth(request);
  if (!canManageUsers(user)) {
    throw new ApiRequestError('Forbidden', 'FORBIDDEN', 403);
  }

  const { id } = await (context as RouteContext).params;
  const authService = getAuthService();

  // Get resource count for the user
  const resourceCount = await authService.getUserResourceCount(id);

  return successResponse({
    repositories: resourceCount.repositories,
    workspaces: resourceCount.workspaces,
  });
});
