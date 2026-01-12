import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositoryService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/api-utils';

// Git URL pattern: supports both HTTPS and SSH URLs
// HTTPS: https://github.com/user/repo.git
// SSH: git@github.com:user/repo.git or ssh://git@github.com/user/repo.git
const gitUrlPattern = /^(https?:\/\/[^\s]+|git@[^\s:]+:[^\s]+|ssh:\/\/[^\s]+)$/;

const createRepoSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  cloneUrl: z.string().min(1, 'Clone URL is required').regex(gitUrlPattern, 'Invalid git URL. Use HTTPS or SSH format.'),
  sshKeyId: z.string().uuid().optional(),
  cloneDepth: z.number().int().positive().optional(), // null = full clone, positive int = shallow
  defaultBranch: z.string().min(1).max(100).optional(),
  techStack: z.array(z.enum(['nodejs', 'python', 'go', 'rust', 'docker'])).optional().default([]),
  templateId: z.string().uuid().optional(),
  // Resource overrides (null = use global defaults)
  resourceMemory: z.number().int().min(512).max(65536).nullable().optional(), // MB
  resourceCpuCores: z.number().int().min(1).max(32).nullable().optional(),
  resourceDiskSize: z.number().int().min(4).max(500).nullable().optional(), // GB
  // Git identity (either use a saved identity or custom values)
  gitIdentityId: z.string().uuid().nullable().optional(), // FK to gitIdentities
  gitCustomName: z.string().max(200).nullable().optional(), // Custom git user.name
  gitCustomEmail: z.string().max(200).email().nullable().optional(), // Custom git user.email
});

/**
 * GET /api/repositories - List all repositories for the authenticated user
 * - Admin and template-admin users see all repositories
 * - Other users see only their own repositories
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const repoService = getRepositoryService();

  const repositories = await repoService.listRepositories(user.id, user.role);

  return successResponse({ repositories });
});

/**
 * POST /api/repositories - Create a new repository
 * NOTE: This now only stores metadata. The actual cloning happens in containers.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const body = await request.json();

  const result = createRepoSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const repoService = getRepositoryService();
  const repository = await repoService.createRepository(user.id, {
    name: result.data.name,
    description: result.data.description,
    cloneUrl: result.data.cloneUrl,
    sshKeyId: result.data.sshKeyId,
    cloneDepth: result.data.cloneDepth,
    defaultBranch: result.data.defaultBranch,
    techStack: result.data.techStack,
    templateId: result.data.templateId,
    resourceMemory: result.data.resourceMemory,
    resourceCpuCores: result.data.resourceCpuCores,
    resourceDiskSize: result.data.resourceDiskSize,
    gitIdentityId: result.data.gitIdentityId,
    gitCustomName: result.data.gitCustomName,
    gitCustomEmail: result.data.gitCustomEmail,
  });

  return successResponse({ repository }, 201);
});
