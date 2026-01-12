import { NextRequest } from 'next/server';
import { getWorkspaceService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
} from '@/lib/api-utils';

/**
 * GET /api/workspaces/shared-with-me - List workspaces shared with the current user
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);

  const workspaceService = await getWorkspaceService();
  const sharedWorkspaces = await workspaceService.listSharedWithMe(user.id);

  return successResponse(sharedWorkspaces);
});
