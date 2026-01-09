import { NextRequest } from 'next/server';
import { getSecretsService } from '@/lib/services/secrets-service';
import { getRepositoryService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
  ApiRequestError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/repositories/:id/secrets
 * List secrets assigned to a repository
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  // Verify repository ownership
  const repositoryService = await getRepositoryService();
  const repository = await repositoryService.getRepository(id);

  if (!repository) {
    throw new NotFoundError('Repository', id);
  }

  if (repository.userId !== user.id) {
    throw new ApiRequestError('Access denied', 'FORBIDDEN', 403);
  }

  const secretsService = getSecretsService();
  const secrets = await secretsService.getRepositorySecrets(id);

  return successResponse({ secrets });
});

/**
 * PUT /api/repositories/:id/secrets
 * Assign secrets to a repository (batch operation - replaces all)
 */
export const PUT = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  // Verify repository ownership
  const repositoryService = await getRepositoryService();
  const repository = await repositoryService.getRepository(id);

  if (!repository) {
    throw new NotFoundError('Repository', id);
  }

  if (repository.userId !== user.id) {
    throw new ApiRequestError('Access denied', 'FORBIDDEN', 403);
  }

  const body = await request.json();
  const { secrets } = body;

  if (!Array.isArray(secrets)) {
    throw new ApiRequestError(
      'secrets must be an array of { secretId, includeInEnvFile }',
      'VALIDATION_ERROR',
      400
    );
  }

  // Validate each secret assignment
  for (const assignment of secrets) {
    if (!assignment.secretId || typeof assignment.includeInEnvFile !== 'boolean') {
      throw new ApiRequestError(
        'Each secret must have secretId and includeInEnvFile (boolean)',
        'VALIDATION_ERROR',
        400
      );
    }
  }

  const secretsService = getSecretsService();
  await secretsService.assignSecretsToRepository(id, secrets);

  // Return updated list
  const updatedSecrets = await secretsService.getRepositorySecrets(id);

  return successResponse({ assigned: secrets.length, secrets: updatedSecrets });
});
