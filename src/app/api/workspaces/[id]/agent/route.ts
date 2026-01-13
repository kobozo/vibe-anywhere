import { NextRequest } from 'next/server';
import { getRepositoryService, getWorkspaceService, getAgentRegistry } from '@/lib/services';
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
 * GET /api/workspaces/[id]/agent - Get agent info for a workspace
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

  const agentRegistry = getAgentRegistry();
  const expectedVersion = agentRegistry.getExpectedVersion();
  const agent = agentRegistry.getAgent(id);

  const currentVersion = workspace.agentVersion || null;
  const isConnected = agentRegistry.hasAgent(id);

  // Check if update is available
  let updateAvailable = false;
  if (currentVersion && expectedVersion) {
    const current = currentVersion.split('.').map(Number);
    const expected = expectedVersion.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const c = current[i] || 0;
      const e = expected[i] || 0;
      if (e > c) {
        updateAvailable = true;
        break;
      }
      if (e < c) break;
    }
  }

  return successResponse({
    agent: {
      connected: isConnected,
      currentVersion,
      expectedVersion,
      updateAvailable,
      connectedAt: workspace.agentConnectedAt,
      lastHeartbeat: workspace.agentLastHeartbeat,
      tabCount: agent?.tabs.size || 0,
      tailscaleConnected: agent?.tailscaleConnected ?? null,
      chromeStatus: agent?.chromeStatus ?? null,
    },
  });
});
