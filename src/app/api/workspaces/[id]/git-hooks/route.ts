import { NextRequest } from 'next/server';
import { getWorkspaceService, getRepositoryService } from '@/lib/services';
import { execSSHCommand } from '@/lib/container/proxmox/ssh-stream';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Standard git hooks that we look for
const STANDARD_HOOKS = [
  'pre-commit',
  'prepare-commit-msg',
  'commit-msg',
  'post-commit',
  'pre-push',
  'pre-rebase',
  'post-checkout',
  'post-merge',
];

interface GitHook {
  name: string;
  exists: boolean;
  executable: boolean;
  size: number;
  isSample: boolean;
}

/**
 * GET /api/workspaces/[id]/git-hooks - List git hooks in workspace
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const workspaceService = await getWorkspaceService();
  const workspace = await workspaceService.getWorkspace(id);

  if (!workspace) {
    throw new NotFoundError('Workspace', id);
  }

  // Verify ownership through repository
  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(workspace.repositoryId);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Workspace', id);
  }

  // Check if container is running
  if (workspace.containerStatus !== 'running' || !workspace.containerIp) {
    return successResponse({
      available: false,
      reason: 'Container is not running',
      hooks: [],
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
      });
    }

    // List all files in .git/hooks with details
    const result = await execSSHCommand(
      { host: workspace.containerIp, username: 'root' },
      ['bash', '-c', 'ls -la /workspace/.git/hooks/ 2>/dev/null || echo "no hooks dir"'],
      { workingDir: '/workspace' }
    );

    if (result.stdout.includes('no hooks dir')) {
      return successResponse({
        available: true,
        hooks: STANDARD_HOOKS.map(name => ({
          name,
          exists: false,
          executable: false,
          size: 0,
          isSample: false,
        })),
      });
    }

    // Parse ls output to get hook info
    const hooks: GitHook[] = [];
    const lines = result.stdout.split('\n');
    const fileMap = new Map<string, { executable: boolean; size: number }>();

    for (const line of lines) {
      // Parse ls -la output: -rwxr-xr-x 1 user group size date name
      const match = line.match(/^([drwx-]{10})\s+\d+\s+\w+\s+\w+\s+(\d+)\s+\w+\s+\d+\s+[\d:]+\s+(.+)$/);
      if (match) {
        const [, permissions, sizeStr, filename] = match;
        const isExecutable = permissions.includes('x');
        const size = parseInt(sizeStr, 10);
        fileMap.set(filename, { executable: isExecutable, size });
      }
    }

    // Build hooks list for standard hooks
    for (const hookName of STANDARD_HOOKS) {
      const hookInfo = fileMap.get(hookName);
      const sampleInfo = fileMap.get(`${hookName}.sample`);

      hooks.push({
        name: hookName,
        exists: !!hookInfo,
        executable: hookInfo?.executable || false,
        size: hookInfo?.size || 0,
        isSample: !hookInfo && !!sampleInfo,
      });
    }

    return successResponse({
      available: true,
      hooks,
    });
  } catch (error) {
    console.error('Failed to query git hooks:', error);
    return successResponse({
      available: false,
      reason: 'Failed to query git hooks',
      hooks: [],
    });
  }
});
