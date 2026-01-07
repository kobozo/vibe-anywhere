import { NextRequest } from 'next/server';
import { getRepositoryService } from '@/lib/services';
import { getEnvVarSyncService } from '@/lib/services/env-var-sync-service';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
} from '@/lib/api-utils';
import { db } from '@/lib/db';
import { workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/workspaces/[id]/env-diff - Check if workspace .env differs from repo env vars
 *
 * Returns detailed diff information including:
 * - Whether differences exist
 * - Which keys were added/removed/changed
 * - Current values in workspace vs repository
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  // Get workspace
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id));

  if (!workspace) {
    throw new NotFoundError('Workspace', id);
  }

  // Verify ownership through repository
  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(workspace.repositoryId);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Workspace', id);
  }

  // Get env var diff
  const envVarSyncService = getEnvVarSyncService();
  const diff = await envVarSyncService.getEnvVarDiff(id);

  return successResponse(diff);
});
