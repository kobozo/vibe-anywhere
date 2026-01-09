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

    // NEW: Push to agent via WebSocket (v1.8.4+)
    const { pushEnvVarsToAgent } = await import('@/lib/websocket/server');

    try {
      // Try agent push first
      const result = await pushEnvVarsToAgent(
        workspaceId,
        mergedEnvVars,
        workspace.repositoryId
      );

      if (!result.success) {
        throw new Error(result.error || 'Agent failed to apply env vars');
      }

      console.log(`Agent successfully updated env vars for workspace ${workspaceId}:`, result.applied);
    } catch (error) {
      console.warn('Failed to push env vars via agent, falling back to SSH method:', error);

      // FALLBACK: Use SSH method for backwards compatibility (agents < v1.8.4)
      const containerBackend = await getContainerBackendAsync();
      const backendType = containerBackend?.constructor?.name;

      if (backendType === 'ProxmoxBackend') {
        console.log('Using SSH fallback for env var sync');
        await containerBackend.injectEnvVars(workspace.containerId, mergedEnvVars);
        await updateTmuxEnvironmentViaSSH(workspace.containerId, mergedEnvVars, containerBackend);
        console.log(`Updated env vars via SSH for workspace ${workspaceId}`);
      } else {
        // Docker backend doesn't support runtime injection
        return NextResponse.json(
          {
            error: {
              message: 'Environment variable reload is only supported for Proxmox LXC containers',
              details: {
                backendType: backendType || 'unknown',
                agentError: error instanceof Error ? error.message : String(error),
              }
            }
          },
          { status: 400 }
        );
      }
    }

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
 * Update tmux environment variables via SSH (FALLBACK METHOD for agents < v1.8.4)
 * Sets variables in tmux server so new windows inherit them
 * Also unsets any previously managed variables that were removed
 */
async function updateTmuxEnvironmentViaSSH(
  containerId: string,
  envVars: Record<string, string>,
  containerBackend: any
): Promise<void> {
  try {
    const commands: string[] = [];

    // Step 1: Get existing Session Hub env vars from /etc/profile.d/session-hub-env.sh
    // This tells us which vars we previously managed, so we can unset removed ones
    try {
      const { stdout } = await containerBackend.executeCommand(containerId, [
        'bash',
        '-c',
        'cat /etc/profile.d/session-hub-env.sh 2>/dev/null || true'
      ]);

      if (stdout) {
        // Parse the file to extract variable names (lines like "export VAR_NAME='value'")
        const existingVarNames = stdout
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('export '))
          .map(line => {
            // Extract var name from "export VAR_NAME='value'" or "export VAR_NAME=value"
            const match = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/);
            return match ? match[1] : null;
          })
          .filter((name): name is string => name !== null);

        // Unset any vars that were in the old file but not in the new envVars
        for (const oldVarName of existingVarNames) {
          if (!(oldVarName in envVars)) {
            commands.push(`tmux set-environment -gu ${oldVarName}`);
          }
        }
      }
    } catch (error) {
      console.warn('Could not read existing env file for cleanup:', error);
      // Continue anyway - not critical
    }

    // Step 2: Set all the new env vars
    for (const [key, value] of Object.entries(envVars)) {
      // Escape single quotes in value
      const escapedValue = value.replace(/'/g, "'\\''");
      commands.push(`tmux set-environment -g ${key} '${escapedValue}'`);
    }

    // Execute all commands in one SSH session
    if (commands.length > 0) {
      const commandStr = commands.join(' && ');
      await containerBackend.executeCommand(containerId, ['bash', '-c', commandStr]);
    }

    console.log(`Updated tmux environment: ${Object.keys(envVars).length} vars set, ${commands.length - Object.keys(envVars).length} vars unset`);
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
