import { NextRequest } from 'next/server';
import { getRepositoryService, getSSHKeyService } from '@/lib/services';
import { db } from '@/lib/db';
import { proxmoxTemplates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface GitHook {
  name: string;
  path: string;
  enabled: boolean;
}

/**
 * GET /api/repositories/[id]/details - Get detailed repository information
 * Includes SSH keys, template info, git hooks, tech stack, and remote info
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  // Get branches for the repository
  const branches = await repoService.getBranches(id);

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

  // Get repository absolute path
  const repoPath = repoService.getAbsolutePath(repository);

  // Get git hooks info
  const hooks: GitHook[] = [];
  const hooksDir = path.join(repoPath, '.git', 'hooks');

  const commonHooks = [
    'pre-commit',
    'prepare-commit-msg',
    'commit-msg',
    'post-commit',
    'pre-push',
    'post-merge',
    'pre-rebase',
    'post-checkout',
    'post-receive',
  ];

  for (const hookName of commonHooks) {
    const hookPath = path.join(hooksDir, hookName);
    const samplePath = path.join(hooksDir, `${hookName}.sample`);

    // Check if actual hook exists (not just sample)
    if (fs.existsSync(hookPath)) {
      const stats = fs.statSync(hookPath);
      // Hook is enabled if it's executable
      const isExecutable = (stats.mode & 0o111) !== 0;
      hooks.push({
        name: hookName,
        path: hookPath,
        enabled: isExecutable,
      });
    }
  }

  // Get git remote info
  let remotes: Array<{ name: string; url: string; type: string }> = [];
  try {
    const remoteOutput = execSync('git remote -v', { cwd: repoPath, encoding: 'utf-8' });
    const lines = remoteOutput.trim().split('\n').filter(Boolean);
    const remoteMap = new Map<string, { fetch?: string; push?: string }>();

    for (const line of lines) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      if (match) {
        const [, name, url, type] = match;
        if (!remoteMap.has(name)) {
          remoteMap.set(name, {});
        }
        const remote = remoteMap.get(name)!;
        if (type === 'fetch') remote.fetch = url;
        if (type === 'push') remote.push = url;
      }
    }

    remotes = Array.from(remoteMap.entries()).map(([name, urls]) => ({
      name,
      url: urls.fetch || urls.push || '',
      type: urls.fetch === urls.push ? 'both' : 'separate',
    }));
  } catch {
    // No remotes or not a git repo
  }

  // Get last commit info
  let lastCommit = null;
  try {
    const commitInfo = execSync(
      'git log -1 --format="%H|%s|%an|%ae|%ai"',
      { cwd: repoPath, encoding: 'utf-8' }
    ).trim();

    if (commitInfo) {
      const [hash, subject, authorName, authorEmail, date] = commitInfo.split('|');
      lastCommit = {
        hash,
        shortHash: hash.substring(0, 7),
        subject,
        authorName,
        authorEmail,
        date,
      };
    }
  } catch {
    // No commits yet
  }

  // Get stats
  let stats = null;
  try {
    const commitCount = execSync('git rev-list --count HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
    const branchCount = branches.length;

    stats = {
      commitCount: parseInt(commitCount, 10),
      branchCount,
    };
  } catch {
    stats = { commitCount: 0, branchCount: branches.length };
  }

  return successResponse({
    repository,
    branches,
    sshKey,
    template,
    hooks,
    remotes,
    lastCommit,
    stats,
  });
});
