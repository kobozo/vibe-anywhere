import { NextRequest } from 'next/server';
import { getWorkspaceService, getRepositoryService } from '@/lib/services';
import { getGitHooksService, STANDARD_HOOKS } from '@/lib/services/git-hooks-service';
import { execSSHCommand } from '@/lib/container/proxmox/ssh-stream';
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

interface GitHook {
  name: string;
  exists: boolean;
  executable: boolean;
  size: number;
  isSample: boolean;
  inRepo: boolean;       // Whether this hook is saved in repository
  syncStatus: 'synced' | 'different' | 'local-only' | 'repo-only' | 'none';
}

/**
 * Helper to get workspace with auth check
 */
async function getAuthorizedWorkspace(request: NextRequest, id: string) {
  const user = await requireAuth(request);
  const workspaceService = await getWorkspaceService();
  const workspace = await workspaceService.getWorkspace(id);

  if (!workspace) {
    throw new NotFoundError('Workspace', id);
  }

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(workspace.repositoryId);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Workspace', id);
  }

  return { workspace, repository };
}

/**
 * GET /api/workspaces/[id]/git-hooks - List git hooks in workspace with sync status
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const { id } = await (context as RouteContext).params;
  const { workspace, repository } = await getAuthorizedWorkspace(request, id);
  const gitHooksService = getGitHooksService();

  // Get repository-level hooks
  const repoHooks = await gitHooksService.getRepositoryGitHooks(repository.id);
  const repoHookNames = new Set(Object.keys(repoHooks));

  // Check if container is running
  if (workspace.containerStatus !== 'running' || !workspace.containerIp) {
    // Return repo hooks info even if container is not running
    const hooks: GitHook[] = STANDARD_HOOKS.map(name => ({
      name,
      exists: false,
      executable: false,
      size: 0,
      isSample: false,
      inRepo: repoHookNames.has(name),
      syncStatus: repoHookNames.has(name) ? 'repo-only' : 'none',
    }));

    return successResponse({
      available: false,
      reason: 'Container is not running',
      hooks,
      repoHooks: gitHooksService.getHooksList(repoHooks),
      syncStatus: {
        inSync: false,
        repoOnly: Array.from(repoHookNames),
        containerOnly: [],
        different: [],
        synced: [],
      },
    });
  }

  try {
    // Check if .git directory exists
    const gitCheckResult = await execSSHCommand(
      { host: workspace.containerIp, username: 'root' },
      ['test', '-d', '/workspace/.git', '&&', 'echo', 'exists'],
      { workingDir: '/workspace' }
    );

    if (!gitCheckResult.stdout.includes('exists')) {
      return successResponse({
        available: false,
        reason: 'No git repository in workspace',
        hooks: [],
        repoHooks: gitHooksService.getHooksList(repoHooks),
        syncStatus: null,
      });
    }

    // Read hooks from container (with content for comparison)
    const containerHooks = await gitHooksService.readHooksFromContainer(workspace.containerIp);
    const containerHookNames = new Set(Object.keys(containerHooks));

    // Compare hooks
    const syncStatus = gitHooksService.compareHooks(repoHooks, containerHooks);

    // List all files in .git/hooks with details for UI
    const result = await execSSHCommand(
      { host: workspace.containerIp, username: 'root' },
      ['bash', '-c', 'ls -la /workspace/.git/hooks/ 2>/dev/null || echo "no hooks dir"'],
      { workingDir: '/workspace' }
    );

    const fileMap = new Map<string, { executable: boolean; size: number }>();

    if (!result.stdout.includes('no hooks dir')) {
      const lines = result.stdout.split('\n');
      for (const line of lines) {
        const match = line.match(/^([drwx-]{10})\s+\d+\s+\w+\s+\w+\s+(\d+)\s+\w+\s+\d+\s+[\d:]+\s+(.+)$/);
        if (match) {
          const [, permissions, sizeStr, filename] = match;
          const isExecutable = permissions.includes('x');
          const size = parseInt(sizeStr, 10);
          fileMap.set(filename, { executable: isExecutable, size });
        }
      }
    }

    // Build hooks list with sync status
    const hooks: GitHook[] = [];
    for (const hookName of STANDARD_HOOKS) {
      const hookInfo = fileMap.get(hookName);
      const sampleInfo = fileMap.get(`${hookName}.sample`);
      const inRepo = repoHookNames.has(hookName);
      const inContainer = containerHookNames.has(hookName);

      let hookSyncStatus: GitHook['syncStatus'] = 'none';
      if (inRepo && inContainer) {
        hookSyncStatus = syncStatus.synced.includes(hookName) ? 'synced' : 'different';
      } else if (inRepo && !inContainer) {
        hookSyncStatus = 'repo-only';
      } else if (!inRepo && inContainer) {
        hookSyncStatus = 'local-only';
      }

      hooks.push({
        name: hookName,
        exists: !!hookInfo,
        executable: hookInfo?.executable || false,
        size: hookInfo?.size || 0,
        isSample: !hookInfo && !!sampleInfo,
        inRepo,
        syncStatus: hookSyncStatus,
      });
    }

    return successResponse({
      available: true,
      hooks,
      repoHooks: gitHooksService.getHooksList(repoHooks),
      syncStatus,
    });
  } catch (error) {
    console.error('Failed to query git hooks:', error);
    return successResponse({
      available: false,
      reason: 'Failed to query git hooks',
      hooks: [],
      repoHooks: gitHooksService.getHooksList(repoHooks),
      syncStatus: null,
    });
  }
});

/**
 * POST /api/workspaces/[id]/git-hooks - Push repository hooks to container
 * Optionally specify hooks to push, otherwise pushes all repo hooks
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const { id } = await (context as RouteContext).params;
  const { workspace, repository } = await getAuthorizedWorkspace(request, id);

  if (workspace.containerStatus !== 'running' || !workspace.containerIp) {
    throw new ValidationError('Container is not running');
  }

  const body = await request.json().catch(() => ({}));
  const hookNames: string[] | undefined = body.hooks; // Optional: specific hooks to push

  const gitHooksService = getGitHooksService();
  const repoHooks = await gitHooksService.getRepositoryGitHooks(repository.id);

  // Filter hooks if specific ones requested
  let hooksToPush = repoHooks;
  if (hookNames && hookNames.length > 0) {
    hooksToPush = {};
    for (const name of hookNames) {
      if (repoHooks[name]) {
        hooksToPush[name] = repoHooks[name];
      }
    }
  }

  if (Object.keys(hooksToPush).length === 0) {
    throw new ValidationError('No hooks to push');
  }

  await gitHooksService.writeHooksToContainer(workspace.containerIp, hooksToPush);

  return successResponse({
    pushed: Object.keys(hooksToPush),
    message: `Pushed ${Object.keys(hooksToPush).length} hook(s) to container`,
  });
});

/**
 * PUT /api/workspaces/[id]/git-hooks - Pull container hooks to repository
 * Optionally specify hooks to pull, otherwise pulls all container hooks
 */
export const PUT = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const { id } = await (context as RouteContext).params;
  const { workspace, repository } = await getAuthorizedWorkspace(request, id);

  if (workspace.containerStatus !== 'running' || !workspace.containerIp) {
    throw new ValidationError('Container is not running');
  }

  const body = await request.json().catch(() => ({}));
  const hookNames: string[] | undefined = body.hooks; // Optional: specific hooks to pull

  const gitHooksService = getGitHooksService();
  const containerHooks = await gitHooksService.readHooksFromContainer(workspace.containerIp);

  // Filter hooks if specific ones requested
  let hooksToPull = containerHooks;
  if (hookNames && hookNames.length > 0) {
    hooksToPull = {};
    for (const name of hookNames) {
      if (containerHooks[name]) {
        hooksToPull[name] = containerHooks[name];
      }
    }
  }

  if (Object.keys(hooksToPull).length === 0) {
    throw new ValidationError('No hooks to pull from container');
  }

  // Get current repo hooks and merge
  const currentRepoHooks = await gitHooksService.getRepositoryGitHooks(repository.id);
  const mergedHooks = { ...currentRepoHooks, ...hooksToPull };

  await gitHooksService.setRepositoryGitHooks(repository.id, mergedHooks);

  return successResponse({
    pulled: Object.keys(hooksToPull),
    message: `Pulled ${Object.keys(hooksToPull).length} hook(s) to repository`,
  });
});
