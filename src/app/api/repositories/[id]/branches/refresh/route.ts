import { NextRequest } from 'next/server';
import { getRepositoryService } from '@/lib/services';
import { getRemoteGitService } from '@/lib/services/remote-git-service';
import { getRepositoryStateBroadcaster } from '@/lib/services/repository-state-broadcaster';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Trigger background branch refresh (non-blocking)
 * Updates cache and broadcasts via WebSocket when done
 */
async function triggerBranchRefresh(
  repoId: string,
  cloneUrl: string,
  sshKeyId: string | null
): Promise<void> {
  try {
    const remoteGitService = getRemoteGitService();
    const result = await remoteGitService.fetchRemoteBranches({
      repoUrl: cloneUrl,
      sshKeyId: sshKeyId || undefined,
    });

    // Update database cache
    const repoService = getRepositoryService();
    const updatedRepo = await repoService.updateCachedBranches(
      repoId,
      result.branches,
      result.defaultBranch
    );

    // Broadcast update via WebSocket
    const broadcaster = getRepositoryStateBroadcaster();
    broadcaster.broadcastBranchUpdate({
      repositoryId: repoId,
      branches: result.branches,
      defaultBranch: updatedRepo.defaultBranch,
      cachedAt: new Date().toISOString(),
    });

    console.log(
      `[BranchRefresh] Successfully refreshed ${result.branches.length} branches for repo ${repoId}`
    );
  } catch (error) {
    console.error(`[BranchRefresh] Failed to refresh branches for repo ${repoId}:`, error);
    // Don't rethrow - this is a background operation
  }
}

/**
 * POST /api/repositories/[id]/branches/refresh
 * Triggers a background refresh of repository branches
 * Returns immediately with 202 Accepted
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  // Trigger async refresh (don't await)
  // This runs in the background while we return immediately
  triggerBranchRefresh(id, repository.cloneUrl, repository.sshKeyId);

  return successResponse(
    {
      status: 'refresh_started',
      message: 'Branch refresh started. Updates will be broadcast via WebSocket.',
    },
    202
  );
});

/**
 * GET /api/repositories/[id]/branches/refresh
 * Returns current cached branches with staleness info
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  const cacheInfo = await repoService.getCachedBranches(id);

  // If cache is empty, fall back to default branch
  const branches =
    cacheInfo.branches.length > 0
      ? cacheInfo.branches
      : repository.defaultBranch
        ? [repository.defaultBranch]
        : ['main'];

  return successResponse({
    branches,
    defaultBranch: repository.defaultBranch,
    cachedAt: cacheInfo.cachedAt ? new Date(cacheInfo.cachedAt).toISOString() : null,
    isStale: cacheInfo.isStale,
  });
});
