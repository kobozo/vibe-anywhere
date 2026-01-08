import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositoryService } from '@/lib/services';
import { getAgentRegistry } from '@/lib/services/agent-registry';
import { db } from '@/lib/db';
import { workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
  ValidationError,
} from '@/lib/api-utils';

// Valid tech stack IDs
const validTechStacks = ['nodejs', 'python', 'go', 'rust', 'docker'] as const;

const gitUrlPattern = /^(https?:\/\/[^\s]+|git@[^\s:]+:[^\s]+|ssh:\/\/[^\s]+)$/;

const updateRepositorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable().transform(v => v ?? undefined),
  cloneUrl: z.string().regex(gitUrlPattern, 'Invalid git URL').optional(),
  cloneDepth: z.number().int().positive().optional().nullable(),
  defaultBranch: z.string().min(1).max(100).optional(),
  templateId: z.string().uuid().optional().nullable(),
  techStack: z.array(z.enum(validTechStacks)).optional(),
  sshKeyId: z.string().uuid().optional().nullable(),
  // Resource overrides (null = use global defaults)
  resourceMemory: z.number().int().min(512).max(65536).nullable().optional(), // MB
  resourceCpuCores: z.number().int().min(1).max(32).nullable().optional(),
  resourceDiskSize: z.number().int().min(4).max(500).nullable().optional(), // GB
  // Git identity (use saved identity OR custom values)
  gitIdentityId: z.string().uuid().nullable().optional(),
  gitCustomName: z.string().max(100).nullable().optional(),
  gitCustomEmail: z.string().email().nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/repositories/[id] - Get a repository by ID
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

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
    branchesMeta: {
      cachedAt: cacheInfo.cachedAt?.toISOString() || null,
      isStale: cacheInfo.isStale,
    },
  });
});

/**
 * DELETE /api/repositories/[id] - Delete a repository
 */
export const DELETE = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  await repoService.deleteRepository(id);

  return successResponse({ success: true });
});

/**
 * PATCH /api/repositories/[id] - Update a repository
 */
export const PATCH = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();

  const result = updateRepositorySchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  // Check if git identity is being updated
  const gitIdentityChanged =
    result.data.gitIdentityId !== undefined ||
    result.data.gitCustomName !== undefined ||
    result.data.gitCustomEmail !== undefined;

  const updated = await repoService.updateRepository(id, result.data);

  // If git identity changed, push to all running workspaces for this repository
  if (gitIdentityChanged) {
    try {
      // Find all workspaces for this repository
      const repoWorkspaces = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.repositoryId, id));

      // Push git identity to each workspace that has a connected agent
      const agentRegistry = getAgentRegistry();
      for (const ws of repoWorkspaces) {
        if (agentRegistry.hasAgent(ws.id)) {
          console.log(`Pushing git identity update to workspace ${ws.id}`);
          agentRegistry.sendGitIdentityForWorkspace(ws.id).catch((e) => {
            console.error(`Failed to push git identity to workspace ${ws.id}:`, e);
          });
        }
      }
    } catch (e) {
      // Don't fail the update if pushing fails
      console.error('Error pushing git identity to workspaces:', e);
    }
  }

  return successResponse({ repository: updated });
});
