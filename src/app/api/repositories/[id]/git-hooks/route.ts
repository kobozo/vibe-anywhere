import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositoryService } from '@/lib/services';
import { getGitHooksService, STANDARD_HOOKS } from '@/lib/services/git-hooks-service';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
  ValidationError,
} from '@/lib/api-utils';

// Schema for a single git hook
const gitHookSchema = z.object({
  name: z.string().min(1).max(50),
  content: z.string().min(1).max(100000), // Base64 encoded content
  executable: z.boolean().default(true),
});

// Schema for updating all hooks at once
const updateGitHooksSchema = z.object({
  hooks: z.record(z.object({
    content: z.string().min(1).max(100000),
    executable: z.boolean().default(true),
  })),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/repositories/[id]/git-hooks - List saved git hooks
 * Returns hooks stored at repository level
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  const gitHooksService = getGitHooksService();
  const hooks = await gitHooksService.getRepositoryGitHooks(id);
  const hooksList = gitHooksService.getHooksList(hooks);

  return successResponse({
    hooks: hooksList,
    standardHooks: STANDARD_HOOKS,
  });
});

/**
 * PUT /api/repositories/[id]/git-hooks - Update all git hooks
 * Replaces all hooks for the repository
 */
export const PUT = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();

  const result = updateGitHooksSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  const gitHooksService = getGitHooksService();
  await gitHooksService.setRepositoryGitHooks(id, result.data.hooks);

  const hooks = await gitHooksService.getRepositoryGitHooks(id);
  const hooksList = gitHooksService.getHooksList(hooks);

  return successResponse({ hooks: hooksList });
});

/**
 * POST /api/repositories/[id]/git-hooks - Add or update a single git hook
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();

  const result = gitHookSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  const gitHooksService = getGitHooksService();

  // Content should already be base64 encoded from the client
  await gitHooksService.saveHookToRepository(
    id,
    result.data.name,
    Buffer.from(result.data.content, 'base64').toString(), // Decode for storage (service will re-encode)
    result.data.executable
  );

  const hooks = await gitHooksService.getRepositoryGitHooks(id);
  const hooksList = gitHooksService.getHooksList(hooks);

  return successResponse({ hooks: hooksList });
});

/**
 * DELETE /api/repositories/[id]/git-hooks - Delete a git hook
 * Expects hook name in query string: ?name=pre-commit
 */
export const DELETE = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const name = new URL(request.url).searchParams.get('name');

  if (!name) {
    throw new ValidationError('Missing name parameter');
  }

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  const gitHooksService = getGitHooksService();
  await gitHooksService.deleteHookFromRepository(id, name);

  const hooks = await gitHooksService.getRepositoryGitHooks(id);
  const hooksList = gitHooksService.getHooksList(hooks);

  return successResponse({ hooks: hooksList });
});
