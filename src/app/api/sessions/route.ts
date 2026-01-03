import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getSessionService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/api-utils';

const createSessionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  repoPath: z.string().min(1, 'Repository path is required'),
  branchName: z
    .string()
    .regex(/^[a-zA-Z0-9/_-]+$/, 'Invalid branch name')
    .optional(),
  claudeCommand: z.array(z.string()).optional(),
});

/**
 * GET /api/sessions - List all sessions for the authenticated user
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const sessionService = getSessionService();

  const sessions = await sessionService.listSessions(user.id);
  const sessionInfos = sessions.map((s) => sessionService.toSessionInfo(s));

  return successResponse({ sessions: sessionInfos });
});

/**
 * POST /api/sessions - Create a new session
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const body = await request.json();

  const result = createSessionSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const sessionService = getSessionService();
  const session = await sessionService.createSession(user.id, result.data);

  return successResponse({ session: sessionService.toSessionInfo(session) }, 201);
});
