import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositoryService, getWorkspaceService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ValidationError,
  NotFoundError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

import { CIDR_REGEX, IP_REGEX } from '@/lib/types/network-config';

const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  branchName: z.string().regex(/^[a-zA-Z0-9/_-]+$/, 'Invalid branch name'),
  baseBranch: z.string().optional(),
  // Advanced options
  staticIpAddress: z.string().regex(CIDR_REGEX, 'Invalid CIDR notation (e.g., 192.168.3.50/24)').optional(),
  staticIpGateway: z.string().regex(IP_REGEX, 'Invalid gateway IP address').optional(),
  forcedVmid: z.number().int().min(100, 'VMID must be >= 100').max(999999999).optional(),
  overrideTemplateId: z.string().uuid('Invalid template ID').optional(),
}).refine(
  (data) => {
    // If staticIpAddress is provided, gateway is required
    if (data.staticIpAddress && !data.staticIpGateway) {
      return false;
    }
    // If gateway is provided without IP, that's also invalid
    if (data.staticIpGateway && !data.staticIpAddress) {
      return false;
    }
    return true;
  },
  {
    message: 'Both static IP address and gateway are required when using static IP',
    path: ['staticIpGateway'],
  }
);

/**
 * GET /api/repositories/[id]/workspaces - List workspaces for a repository
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  const workspaceService = await getWorkspaceService();
  const workspaces = await workspaceService.listWorkspaces(id);

  return successResponse({ workspaces });
});

/**
 * POST /api/repositories/[id]/workspaces - Create a new workspace
 * Creates the workspace and starts its container automatically
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();

  const result = createWorkspaceSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(id);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Repository', id);
  }

  const workspaceService = await getWorkspaceService();
  const workspace = await workspaceService.createWorkspace(id, result.data);

  // Start the container in the background (don't await)
  // Progress will be tracked via WebSocket
  workspaceService.startContainer(workspace.id).catch((error) => {
    console.error(`Failed to start container for workspace ${workspace.id}:`, error);
  });

  // Return workspace immediately - container will start in background
  return successResponse({ workspace }, 201);
});
