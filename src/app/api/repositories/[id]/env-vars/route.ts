import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositoryService } from '@/lib/services';
import { getEnvVarService } from '@/lib/services/env-var-service';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
  ValidationError,
} from '@/lib/api-utils';

// Schema for a single env var
const envVarSchema = z.object({
  key: z.string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Key must start with a letter or underscore and contain only alphanumeric characters and underscores'),
  value: z.string().max(10000),
  encrypted: z.boolean().default(false),
});

// Schema for updating all env vars at once
const updateEnvVarsSchema = z.object({
  envVars: z.array(envVarSchema),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/repositories/[id]/env-vars - List environment variables
 * Returns env vars with encrypted values masked
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  const envVarService = getEnvVarService();
  const envVars = await envVarService.getRepositoryEnvVars(id);
  const inheritedEnvVars = await envVarService.getInheritedEnvVarsForRepository(id);

  return successResponse({
    envVars,
    inheritedEnvVars, // From template, for display in UI
  });
});

/**
 * PUT /api/repositories/[id]/env-vars - Update all environment variables
 * Replaces all env vars for the repository
 */
export const PUT = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();

  const result = updateEnvVarsSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  const envVarService = getEnvVarService();
  await envVarService.updateRepositoryEnvVars(id, result.data.envVars);

  // Return the updated env vars (masked)
  const envVars = await envVarService.getRepositoryEnvVars(id);

  return successResponse({ envVars });
});

/**
 * POST /api/repositories/[id]/env-vars - Add a single environment variable
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();

  const result = envVarSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  const envVarService = getEnvVarService();

  // Get existing env vars and add the new one
  const existingEnvVars = repository.envVars || {};
  const newEnvVars = Object.entries(existingEnvVars).map(([key, entry]) => ({
    key,
    value: entry.value,
    encrypted: entry.encrypted,
  }));

  // Add or update the new env var
  const existingIndex = newEnvVars.findIndex(e => e.key === result.data.key);
  if (existingIndex >= 0) {
    newEnvVars[existingIndex] = result.data;
  } else {
    newEnvVars.push(result.data);
  }

  await envVarService.updateRepositoryEnvVars(id, newEnvVars);

  // Return the updated env vars (masked)
  const envVars = await envVarService.getRepositoryEnvVars(id);

  return successResponse({ envVars });
});

/**
 * DELETE /api/repositories/[id]/env-vars - Delete an environment variable
 * Expects key in query string: ?key=MY_VAR
 */
export const DELETE = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const key = new URL(request.url).searchParams.get('key');

  if (!key) {
    throw new ValidationError('Missing key parameter');
  }

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  const envVarService = getEnvVarService();

  // Get existing env vars and remove the one with matching key
  const existingEnvVars = repository.envVars || {};
  const newEnvVars = Object.entries(existingEnvVars)
    .filter(([k]) => k !== key)
    .map(([k, entry]) => ({
      key: k,
      value: entry.value,
      encrypted: entry.encrypted,
    }));

  await envVarService.updateRepositoryEnvVars(id, newEnvVars);

  // Return the updated env vars (masked)
  const envVars = await envVarService.getRepositoryEnvVars(id);

  return successResponse({ envVars });
});
