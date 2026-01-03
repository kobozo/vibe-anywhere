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
 * POST /api/sessions/:id/attach - Prepare to attach to a session
 * Returns WebSocket URL and buffered output for reconnection
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

  if (session.status !== 'running') {
    return errorResponse('SESSION_NOT_RUNNING', 'Session is not running. Start it first.', 400);
  }

  // Get buffered output for reconnection
  const outputBuffer = await sessionService.getOutputBuffer(id);

  // Return WebSocket connection info
  // The actual WebSocket URL will be the same host but on the socket server
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  const wsProtocol = protocol === 'https' ? 'wss' : 'ws';

  return successResponse({
    sessionId: id,
    wsUrl: `${wsProtocol}://${host}`,
    outputBuffer,
  });
});
