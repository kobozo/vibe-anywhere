import { NextRequest } from 'next/server';
import { getRepositoryService, getWorkspaceService, getAgentRegistry } from '@/lib/services';
import { config } from '@/lib/config';
import { execSSHCommand } from '@/lib/container/proxmox/ssh-stream';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
  ApiError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/workspaces/[id]/agent/update - Trigger agent update
 * If agent is connected, sends update request via WebSocket
 * If agent is disconnected, pushes update via SSH and restarts service
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
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

  // Build the bundle URL
  const sessionHubUrl = process.env.SESSION_HUB_URL || `http://localhost:${config.server.port}`;
  const bundleUrl = `${sessionHubUrl}/api/agent/bundle`;

  // If agent is connected, try WebSocket update first
  if (agentRegistry.hasAgent(id)) {
    const sent = agentRegistry.requestUpdate(id, bundleUrl);
    if (sent) {
      return successResponse({
        message: `Update request sent via WebSocket. Agent will update to version ${expectedVersion} and restart.`,
        targetVersion: expectedVersion,
        method: 'websocket',
      });
    }
  }

  // Fall back to SSH-based update (for disconnected agents or failed WebSocket)
  if (!workspace.containerIp) {
    throw new ApiError(400, 'Container IP not available. Is the container running?');
  }

  if (workspace.containerStatus !== 'running') {
    throw new ApiError(400, 'Container is not running');
  }

  console.log(`Pushing agent update via SSH to ${workspace.containerIp}`);

  try {
    // Stop the agent service first
    await execSSHCommand(
      { host: workspace.containerIp, username: 'root' },
      ['systemctl', 'stop', 'vibe-anywhere-agent'],
      { workingDir: '/' }
    ).catch(() => {
      // Service might not be running
    });

    // Download and install the new agent bundle
    const updateScript = `
      cd /opt/vibe-anywhere-agent

      # Download agent bundle
      echo "Downloading agent bundle from ${bundleUrl}..."
      curl -fSL -o agent-bundle.tar.gz "${bundleUrl}" || {
        echo "Failed to download agent bundle"
        exit 1
      }

      # Extract bundle
      echo "Extracting agent bundle..."
      tar -xzf agent-bundle.tar.gz || {
        echo "Failed to extract agent bundle"
        exit 1
      }
      rm agent-bundle.tar.gz

      # Install dependencies if package.json exists
      if [ -f package.json ]; then
        echo "Installing agent dependencies..."
        npm install --production --ignore-scripts 2>/dev/null || true
      fi

      # Ensure kobozo owns everything
      chown -R kobozo:kobozo /opt/vibe-anywhere-agent

      echo "Agent bundle installed successfully"
    `;

    await execSSHCommand(
      { host: workspace.containerIp, username: 'root' },
      ['bash', '-c', updateScript],
      { workingDir: '/opt/vibe-anywhere-agent' }
    );

    // Start the agent service
    await execSSHCommand(
      { host: workspace.containerIp, username: 'root' },
      ['systemctl', 'start', 'vibe-anywhere-agent'],
      { workingDir: '/' }
    );

    console.log(`Agent updated via SSH in container ${workspace.containerId}`);

    return successResponse({
      message: `Agent updated to version ${expectedVersion} via SSH and service restarted.`,
      targetVersion: expectedVersion,
      method: 'ssh',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('SSH agent update failed:', error);
    throw new ApiError(500, `Failed to update agent via SSH: ${message}`);
  }
});
