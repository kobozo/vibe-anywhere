import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getGitIdentityService } from '@/lib/services/git-identity-service';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/api-utils';

const createIdentitySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  gitName: z.string().min(1, 'Git name is required').max(200),
  gitEmail: z.string().min(1, 'Git email is required').max(200).email('Invalid email format'),
  isDefault: z.boolean().optional(),
});

/**
 * GET /api/git-identities - List all git identities for the authenticated user
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const gitIdentityService = getGitIdentityService();

  const identities = await gitIdentityService.listIdentities(user.id);

  return successResponse({ identities });
});

/**
 * POST /api/git-identities - Create a new git identity
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const body = await request.json();

  const result = createIdentitySchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const gitIdentityService = getGitIdentityService();
  const identity = await gitIdentityService.createIdentity(user.id, {
    name: result.data.name,
    gitName: result.data.gitName,
    gitEmail: result.data.gitEmail,
    isDefault: result.data.isDefault,
  });

  return successResponse({ identity }, 201);
});
