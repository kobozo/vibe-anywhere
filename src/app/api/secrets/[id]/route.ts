import { NextRequest } from 'next/server';
import { getSecretsService } from '@/lib/services/secrets-service';
import { requireAuth, successResponse, withErrorHandling, NotFoundError } from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/secrets/:id
 * Get secret details (with masked value)
 * Admin and security-admin can view any secret
 * Other users can only view their own secrets
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const secretsService = getSecretsService();
  const secret = await secretsService.getSecret(id, user.id, user.role);

  if (!secret) {
    throw new NotFoundError('Secret', id);
  }

  return successResponse({ secret });
});

/**
 * PATCH /api/secrets/:id
 * Update a secret
 * Admin and security-admin can update any secret
 * Other users can only update their own secrets
 */
export const PATCH = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();
  const secretsService = getSecretsService();

  const secret = await secretsService.updateSecret(id, user.id, body, user.role);

  return successResponse({
    secret: {
      id: secret.id,
      name: secret.name,
      envKey: secret.envKey,
      description: secret.description,
      templateWhitelist: secret.templateWhitelist,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    },
  });
});

/**
 * DELETE /api/secrets/:id
 * Delete a secret
 * Admin and security-admin can delete any secret
 * Other users can only delete their own secrets
 */
export const DELETE = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const secretsService = getSecretsService();
  await secretsService.deleteSecret(id, user.id, user.role);

  return successResponse({ success: true });
});
