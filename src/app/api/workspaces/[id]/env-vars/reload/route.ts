/**
 * API Route: Reload environment variables for a workspace
 * POST /api/workspaces/[id]/env-vars/reload
 *
 * Updates /etc/profile.d/ and tmux environment without restarting the container
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceService } from '@/lib/services/workspace-service';
import { getEnvVarService } from '@/lib/services/env-var-service';
import { getContainerBackendAsync } from '@/lib/services';
import { getTabService } from '@/lib/services/tab-service';

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: workspaceId } = await context.params;

    // Get workspace
    const workspaceService = await getWorkspaceService();
    const workspace = await workspaceService.getWorkspace(workspaceId);

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Verify container is running
    if (!workspace.containerId || workspace.containerStatus !== 'running') {
      return NextResponse.json(
        {
          error: {
            message: 'Workspace container is not running',
            details: {
              containerId: workspace.containerId,
              containerStatus: workspace.containerStatus,
            }
          }
        },
        { status: 400 }
      );
    }

    // Get merged environment variables
    const envVarService = getEnvVarService();
    const mergedEnvVars = await envVarService.getMergedEnvVars(
      workspace.repositoryId,
      workspace.templateId
    );

    // Get container backend
    const containerBackend = await getContainerBackendAsync();

    // Update /etc/profile.d/session-hub-env.sh
    // Check by constructor name to avoid instanceof issues with lazy-loaded modules
    const backendType = containerBackend?.constructor?.name;
    if (backendType === 'ProxmoxBackend') {
      await containerBackend.injectEnvVars(workspace.containerId, mergedEnvVars);
      console.log(`Updated env vars for workspace ${workspaceId}`);
    } else {
      // Docker backend doesn't support runtime injection
      return NextResponse.json(
        {
          error: {
            message: 'Environment variable reload is only supported for Proxmox LXC containers',
            details: {
              backendType: backendType || 'unknown',
            }
          }
        },
        { status: 400 }
      );
    }

    // Update tmux environment (new feature in this endpoint)
    await updateTmuxEnvironment(workspace.containerId, mergedEnvVars, containerBackend);

    // Send notification to active tabs
    await sendNotificationToTabs(workspaceId);

    return NextResponse.json({
      success: true,
      message: 'Environment variables reloaded successfully',
      varsCount: Object.keys(mergedEnvVars).length,
    });
  } catch (error) {
    console.error('Error reloading env vars:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to reload environment variables',
      },
      { status: 500 }
    );
  }
}

/**
 * Update tmux environment variables
 * Sets variables in tmux server so new windows inherit them
 */
async function updateTmuxEnvironment(
  containerId: string,
  envVars: Record<string, string>,
  containerBackend: any
): Promise<void> {
  try {
    const vmid = parseInt(containerId, 10);

    // Build tmux set-environment commands
    const commands: string[] = [];
    for (const [key, value] of Object.entries(envVars)) {
      // Escape single quotes in value
      const escapedValue = value.replace(/'/g, "'\\''");
      commands.push(`tmux set-environment -g ${key} '${escapedValue}'`);
    }

    // Execute all commands in one SSH session
    const commandStr = commands.join(' && ');
    await containerBackend.executeCommand(containerId, ['bash', '-c', commandStr]);

    console.log(`Updated tmux environment with ${Object.keys(envVars).length} variables`);
  } catch (error) {
    console.error('Failed to update tmux environment:', error);
    // Don't throw - this is not critical, /etc/profile.d/ was still updated
  }
}

/**
 * Send notification to all active tabs in the workspace
 * Displays a message telling users to reload their environment
 */
async function sendNotificationToTabs(workspaceId: string): Promise<void> {
  try {
    const tabService = getTabService();
    const tabs = await tabService.getTabsByWorkspace(workspaceId);

    // Filter for running tabs only
    const runningTabs = tabs.filter(tab => tab.status === 'running');

    if (runningTabs.length === 0) {
      return; // No active tabs to notify
    }

    // Create notification message with ANSI colors
    const notification = `\n\x1b[38;5;214m╭─────────────────────────────────────────────╮\x1b[0m
\x1b[38;5;214m│\x1b[0m 💡 Environment variables have been updated  \x1b[38;5;214m│\x1b[0m
\x1b[38;5;214m│\x1b[0m                                             \x1b[38;5;214m│\x1b[0m
\x1b[38;5;214m│\x1b[0m Run: \x1b[1mreload-env\x1b[0m                            \x1b[38;5;214m│\x1b[0m
\x1b[38;5;214m│\x1b[0m (or: eval $(session-hub reload env))       \x1b[38;5;214m│\x1b[0m
\x1b[38;5;214m╰─────────────────────────────────────────────╯\x1b[0m\n`;

    // Get agent registry to send notifications
    const { getAgentRegistry } = await import('@/lib/services/agent-registry');
    const agentRegistry = getAgentRegistry();

    // Check if agent is connected
    if (!agentRegistry.hasAgent(workspaceId)) {
      console.warn(`Cannot send notification: agent not connected for workspace ${workspaceId}`);
      return;
    }

    // Send notification to each running tab
    for (const tab of runningTabs) {
      // Send the notification as terminal output (not input - we don't want to type it)
      // We use the tabStreamManager to broadcast output directly
      const { getTabStreamManager } = await import('@/lib/services/tab-stream-manager');
      const tabStreamManager = getTabStreamManager();
      tabStreamManager.broadcastOutput(tab.id, notification);
    }

    console.log(`Sent env var reload notification to ${runningTabs.length} tabs in workspace ${workspaceId}`);
  } catch (error) {
    console.error('Failed to send notifications to tabs:', error);
    // Don't throw - notifications are nice-to-have, not critical
  }
}
