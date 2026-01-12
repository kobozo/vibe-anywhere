import { NextRequest } from 'next/server';
import { getSecretsService } from '@/lib/services/secrets-service';
import { requireAuth, successResponse, withErrorHandling } from '@/lib/api-utils';

/**
 * GET /api/secrets
 * List user's secrets (with masked values)
 * Admin and security-admin can see all secrets (masked)
 * Other roles only see their own secrets
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const secretsService = getSecretsService();
  const secrets = await secretsService.listUserSecrets(user.id, user.role);
  return successResponse({ secrets });
});

/**
 * POST /api/secrets
 * Create a new secret
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const body = await request.json();
  const { name, envKey, value, description, templateWhitelist } = body;

  if (!name || !envKey || !value) {
    throw new Error('Missing required fields: name, envKey, value');
  }

  if (!Array.isArray(templateWhitelist)) {
    throw new Error('templateWhitelist must be an array');
  }

  const secretsService = getSecretsService();
  const secret = await secretsService.createSecret(user.id, {
    name,
    envKey,
    value,
    description,
    templateWhitelist,
  });

  return successResponse(
    {
      secret: {
        id: secret.id,
        name: secret.name,
        envKey: secret.envKey,
        description: secret.description,
        templateWhitelist: secret.templateWhitelist,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
      },
    },
    201
  );
});
