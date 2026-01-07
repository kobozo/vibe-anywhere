import { NextRequest } from 'next/server';
import { getRepositoryService, getSSHKeyService } from '@/lib/services';
import { getGitHooksService } from '@/lib/services/git-hooks-service';
import { db } from '@/lib/db';
import { proxmoxTemplates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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
 * GET /api/repositories/[id]/details - Get detailed repository information
 * Returns repository metadata, SSH key info, and template info.
 * NOTE: Git hooks, branches, and commit info are no longer available here
 * since repositories are cloned directly in containers.
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  // Get the SSH key linked to this repository (via repo.sshKeyId)
  const sshKeyService = getSSHKeyService();
  const sshKey = repository.sshKeyId
    ? await sshKeyService.getKey(repository.sshKeyId)
    : null;

  // Get template info if repository has a template
  let template = null;
  if (repository.templateId) {
    const [templateResult] = await db
      .select()
      .from(proxmoxTemplates)
      .where(eq(proxmoxTemplates.id, repository.templateId))
      .limit(1);
    template = templateResult || null;
  }

  // Parse remote info from cloneUrl
  let remotes: Array<{ name: string; url: string; type: string }> = [];
  if (repository.cloneUrl) {
    remotes = [{
      name: 'origin',
      url: repository.cloneUrl,
      type: 'both',
    }];
  }

  // Get git hooks stored at repository level
  const gitHooksService = getGitHooksService();
  const repoHooks = await gitHooksService.getRepositoryGitHooks(id);
  const hooks = Object.entries(repoHooks).map(([name, entry]) => ({
    name,
    path: `.git/hooks/${name}`,
    enabled: entry.executable,
  }));

  // Get cached branches or fall back to default branch
  const cacheInfo = await repoService.getCachedBranches(id);
  const branches =
    cacheInfo.branches.length > 0
      ? cacheInfo.branches
      : repository.defaultBranch
        ? [repository.defaultBranch]
        : ['main'];

  return successResponse({
    repository,
    branches,
    sshKey,
    template,
    hooks,
    remotes,
    lastCommit: null, // Commit info not available - would need to query from container
    stats: null, // Stats not available - would need to query from container
    branchesMeta: {
      cachedAt: cacheInfo.cachedAt?.toISOString() || null,
      isStale: cacheInfo.isStale,
    },
  });
});
