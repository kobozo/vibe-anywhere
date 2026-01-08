import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getGitIdentityService } from '@/lib/services/git-identity-service';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
  ValidationError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateIdentitySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  gitName: z.string().min(1).max(200).optional(),
  gitEmail: z.string().min(1).max(200).email('Invalid email format').optional(),
  isDefault: z.boolean().optional(),
});

/**
 * GET /api/git-identities/[id] - Get a git identity by ID
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const gitIdentityService = getGitIdentityService();
  const identity = await gitIdentityService.getIdentity(id);

  if (!identity || identity.userId !== user.id) {
    throw new NotFoundError('Git Identity', id);
  }

  return successResponse({ identity });
});

/**
 * PATCH /api/git-identities/[id] - Update a git identity
 */
export const PATCH = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();

  const result = updateIdentitySchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const gitIdentityService = getGitIdentityService();
  const identity = await gitIdentityService.getIdentity(id);

  if (!identity || identity.userId !== user.id) {
    throw new NotFoundError('Git Identity', id);
  }

  // Handle setting as default separately
  if (result.data.isDefault === true) {
    await gitIdentityService.setDefaultIdentity(user.id, id);
  }

  // Update other fields if provided
  const { isDefault, ...updateData } = result.data;
  if (Object.keys(updateData).length > 0) {
    await gitIdentityService.updateIdentity(id, updateData);
  }

  // Fetch and return updated identity
  const updatedIdentity = await gitIdentityService.getIdentity(id);
  return successResponse({ identity: updatedIdentity });
});

/**
 * DELETE /api/git-identities/[id] - Delete a git identity
 */
export const DELETE = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const gitIdentityService = getGitIdentityService();
  const identity = await gitIdentityService.getIdentity(id);

  if (!identity || identity.userId !== user.id) {
    throw new NotFoundError('Git Identity', id);
  }

  await gitIdentityService.deleteIdentity(id);

  return successResponse({ success: true });
});
