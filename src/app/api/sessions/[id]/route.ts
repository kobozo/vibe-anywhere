import { NextRequest } from 'next/server';
import { getSessionService } from '@/lib/services';
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
 * GET /api/sessions/:id - Get a session by ID
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

  // Ensure user owns this session
  if (session.userId !== user.id) {
    throw new NotFoundError('Session', id);
  }

  // Sync container status
  const syncedSession = await sessionService.syncContainerStatus(id);

  return successResponse({ session: sessionService.toSessionInfo(syncedSession || session) });
});

/**
 * POST /api/sessions/:id - Start a session
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
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

  if (session.status === 'running') {
    return errorResponse('SESSION_ALREADY_RUNNING', 'Session is already running', 400);
  }

  const startedSession = await sessionService.startSession(id);
  return successResponse({ session: sessionService.toSessionInfo(startedSession) });
});

/**
 * DELETE /api/sessions/:id - Delete a session
 */
export const DELETE = withErrorHandling(async (request: NextRequest, context: unknown) => {
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

  await sessionService.destroySession(id);
  return successResponse({ success: true });
});
