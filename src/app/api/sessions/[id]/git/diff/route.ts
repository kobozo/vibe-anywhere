import { NextRequest } from 'next/server';
import { getSessionService, getGitService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
  errorResponse,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/sessions/:id/git/diff - Get git diff for a session's worktree
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const { params } = context as RouteContext;
  const { id } = await params;
  const user = await requireAuth(request);
  const sessionService = getSessionService();

  const session = await sessionService.getSession(id);
  if (!session) {
    throw new NotFoundError('Session', id);
  }

  if (session.userId !== user.id) {
    throw new NotFoundError('Session', id);
  }

  if (!session.worktreePath) {
    return errorResponse('NO_WORKTREE', 'Session does not have a worktree yet', 400);
  }

  // Check if staged diff is requested
  const { searchParams } = new URL(request.url);
  const staged = searchParams.get('staged') === 'true';

  const gitService = getGitService();
  const diff = await gitService.getDiff(session.worktreePath, staged);

  return successResponse({ diff });
});
