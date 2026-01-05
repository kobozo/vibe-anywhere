import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositoryService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/api-utils';

// Valid tech stack IDs
const validTechStacks = ['nodejs', 'python', 'go', 'rust', 'docker'];

const createLocalRepoSchema = z.object({
  type: z.literal('local'),
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  originalPath: z.string().min(1, 'Path is required'),
  techStack: z.array(z.enum(['nodejs', 'python', 'go', 'rust', 'docker'])).optional().default([]),
});

// Git URL pattern: supports both HTTPS and SSH URLs
// HTTPS: https://github.com/user/repo.git
// SSH: git@github.com:user/repo.git or ssh://git@github.com/user/repo.git
const gitUrlPattern = /^(https?:\/\/[^\s]+|git@[^\s:]+:[^\s]+|ssh:\/\/[^\s]+)$/;

const cloneRepoSchema = z.object({
  type: z.literal('clone'),
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  cloneUrl: z.string().min(1, 'Clone URL is required').regex(gitUrlPattern, 'Invalid git URL. Use HTTPS or SSH format.'),
  sshKeyId: z.string().uuid().optional(),
  techStack: z.array(z.enum(['nodejs', 'python', 'go', 'rust', 'docker'])).optional().default([]),
});

const createRepoSchema = z.discriminatedUnion('type', [
  createLocalRepoSchema,
  cloneRepoSchema,
]);

/**
 * GET /api/repositories - List all repositories for the authenticated user
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const repoService = getRepositoryService();

  const repositories = await repoService.listRepositories(user.id);

  return successResponse({ repositories });
});

/**
 * POST /api/repositories - Create a new repository (local or clone)
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const body = await request.json();

  const result = createRepoSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const repoService = getRepositoryService();
  let repository;

  if (result.data.type === 'local') {
    repository = await repoService.createFromLocal(user.id, {
      name: result.data.name,
      description: result.data.description,
      originalPath: result.data.originalPath,
      techStack: result.data.techStack,
    });
  } else {
    repository = await repoService.cloneRepository(user.id, {
      name: result.data.name,
      description: result.data.description,
      cloneUrl: result.data.cloneUrl,
      sshKeyId: result.data.sshKeyId,
      techStack: result.data.techStack,
    });
  }

  return successResponse({ repository }, 201);
});
