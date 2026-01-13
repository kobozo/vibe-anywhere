import { NextRequest } from 'next/server';
import { getWorkspaceService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string; userId: string }>;
}

/**
 * DELETE /api/workspaces/[id]/share/[userId] - Remove a workspace share
 */
export const DELETE = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id, userId } = await (context as RouteContext).params;

  const workspaceService = await getWorkspaceService();

  // The service method handles authorization checks (owner or admin)
  await workspaceService.unshareWorkspace(id, userId, user.id);

  return successResponse({ success: true });
});
