/**
 * Agent Registry Service
 * Tracks connected sidecar agents and routes messages to them
 */

import type { Socket } from 'socket.io';
import { db } from '@/lib/db';
import { workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getWorkspaceStateBroadcaster } from './workspace-state-broadcaster';
import { startupProgressStore } from './startup-progress-store';

interface TabState {
  tabId: string;
  tmuxWindow: number;
  status: 'pending' | 'running' | 'stopped';
}

interface ConnectedAgent {
  socket: Socket;
  workspaceId: string;
  containerId?: string;
  version: string;
  connectedAt: Date;
  lastHeartbeat: Date;
  tabs: Map<string, TabState>;
}

// Expected agent version (agents older than this will be asked to update)
const EXPECTED_AGENT_VERSION = process.env.AGENT_VERSION || '1.5.3';

class AgentRegistry {
  private agents: Map<string, ConnectedAgent> = new Map();
  private socketToWorkspace: Map<string, string> = new Map();
  private updatingAgents: Set<string> = new Set(); // Track agents being updated

  /**
   * Register a new agent connection
   */
  async register(
    socket: Socket,
    workspaceId: string,
    token: string,
    version: string
  ): Promise<{ success: boolean; error?: string; needsUpdate?: boolean }> {
    // Validate the token against the workspace's agent token
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return { success: false, error: 'Workspace not found' };
    }

    if (workspace.agentToken !== token) {
      return { success: false, error: 'Invalid agent token' };
    }

    // Check for existing agent and disconnect it
    const existing = this.agents.get(workspaceId);
    if (existing) {
      console.log(`Replacing existing agent for workspace ${workspaceId}`);
      existing.socket.disconnect(true);
      this.socketToWorkspace.delete(existing.socket.id);
    }

    // Register the new agent
    const agent: ConnectedAgent = {
      socket,
      workspaceId,
      containerId: workspace.containerId ?? undefined,
      version,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      tabs: new Map(),
    };

    this.agents.set(workspaceId, agent);
    this.socketToWorkspace.set(socket.id, workspaceId);

    // Update database
    await db
      .update(workspaces)
      .set({
        agentConnectedAt: new Date(),
        agentLastHeartbeat: new Date(),
        agentVersion: version,
      })
      .where(eq(workspaces.id, workspaceId));

    console.log(`Agent registered for workspace ${workspaceId} (version ${version})`);

    // Broadcast agent connection status
    try {
      const broadcaster = getWorkspaceStateBroadcaster();
      broadcaster.broadcastAgentStatus(workspaceId, true, version);

      // If there's active startup progress, mark it as ready
      if (startupProgressStore.isStarting(workspaceId)) {
        const readyProgress = startupProgressStore.setProgress(workspaceId, 'ready');
        broadcaster.broadcastStartupProgress(readyProgress);
        // Clear the progress after a short delay to allow clients to see the 'ready' state
        setTimeout(() => {
          startupProgressStore.clearProgress(workspaceId);
        }, 1000);
      }

      // Check if this agent just came back from an update
      if (this.updatingAgents.has(workspaceId)) {
        const needsUpdate = this.shouldUpdate(version, EXPECTED_AGENT_VERSION);
        if (!needsUpdate) {
          // Agent successfully updated
          console.log(`Agent ${workspaceId} successfully updated to ${version}`);
          this.updatingAgents.delete(workspaceId);
          broadcaster.broadcastAgentUpdating(workspaceId, false);
        }
      }
    } catch (e) {
      // Broadcaster might not be initialized yet
    }

    // Check if update is needed
    const needsUpdate = this.shouldUpdate(version, EXPECTED_AGENT_VERSION);
    if (needsUpdate) {
      console.log(`Agent ${workspaceId} needs update from ${version} to ${EXPECTED_AGENT_VERSION}`);
    }

    return { success: true, needsUpdate };
  }

  /**
   * Handle agent disconnection
   */
  async unregister(socket: Socket): Promise<void> {
    const workspaceId = this.socketToWorkspace.get(socket.id);
    if (!workspaceId) return;

    const agent = this.agents.get(workspaceId);
    if (agent && agent.socket.id === socket.id) {
      console.log(`Agent disconnected for workspace ${workspaceId}`);
      this.agents.delete(workspaceId);

      // Update database - clear connected timestamp but keep last heartbeat
      await db
        .update(workspaces)
        .set({
          agentConnectedAt: null,
        })
        .where(eq(workspaces.id, workspaceId));

      // Broadcast agent disconnection status
      try {
        const broadcaster = getWorkspaceStateBroadcaster();
        broadcaster.broadcastAgentStatus(workspaceId, false);
      } catch (e) {
        // Broadcaster might not be initialized
      }
    }

    this.socketToWorkspace.delete(socket.id);
  }

  /**
   * Update agent heartbeat
   */
  async heartbeat(
    workspaceId: string,
    tabs: Array<{ tabId: string; status: string }>
  ): Promise<void> {
    const agent = this.agents.get(workspaceId);
    if (!agent) return;

    agent.lastHeartbeat = new Date();

    // Update tab states
    for (const tab of tabs) {
      const existing = agent.tabs.get(tab.tabId);
      if (existing) {
        existing.status = tab.status as TabState['status'];
      }
    }

    // Update database
    await db
      .update(workspaces)
      .set({
        agentLastHeartbeat: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
  }

  /**
   * Get agent for a workspace
   */
  getAgent(workspaceId: string): ConnectedAgent | undefined {
    return this.agents.get(workspaceId);
  }

  /**
   * Check if a workspace has a connected agent
   */
  hasAgent(workspaceId: string): boolean {
    const agent = this.agents.get(workspaceId);
    return agent !== undefined && agent.socket.connected;
  }

  /**
   * Send a message to an agent
   */
  emit(workspaceId: string, event: string, data: unknown): boolean {
    const agent = this.agents.get(workspaceId);
    if (!agent || !agent.socket.connected) {
      return false;
    }

    agent.socket.emit(event, data);
    return true;
  }

  /**
   * Request agent to create a tab
   */
  createTab(workspaceId: string, tabId: string, command: string[]): boolean {
    return this.emit(workspaceId, 'tab:create', { tabId, command });
  }

  /**
   * Send input to a tab
   */
  sendInput(workspaceId: string, tabId: string, data: string): boolean {
    return this.emit(workspaceId, 'tab:input', { tabId, data });
  }

  /**
   * Resize a tab's terminal
   */
  resizeTab(workspaceId: string, tabId: string, cols: number, rows: number): boolean {
    return this.emit(workspaceId, 'tab:resize', { tabId, cols, rows });
  }

  /**
   * Close a tab
   */
  closeTab(workspaceId: string, tabId: string): boolean {
    return this.emit(workspaceId, 'tab:close', { tabId });
  }

  /**
   * Request output buffer for a tab
   */
  requestBuffer(workspaceId: string, tabId: string, lines: number): boolean {
    return this.emit(workspaceId, 'tab:buffer-request', { tabId, lines });
  }

  /**
   * Request agent to update
   */
  requestUpdate(workspaceId: string, bundleUrl: string): boolean {
    const sent = this.emit(workspaceId, 'agent:update', {
      version: EXPECTED_AGENT_VERSION,
      bundleUrl,
    });

    if (sent) {
      // Track this workspace as updating
      this.updatingAgents.add(workspaceId);

      // Broadcast updating status
      try {
        const broadcaster = getWorkspaceStateBroadcaster();
        broadcaster.broadcastAgentUpdating(workspaceId, true);
      } catch (e) {
        // Broadcaster might not be initialized yet
      }
    }

    return sent;
  }

  /**
   * Check if an agent is currently updating
   */
  isUpdating(workspaceId: string): boolean {
    return this.updatingAgents.has(workspaceId);
  }

  /**
   * Upload a file to the container (for clipboard image paste)
   * Uses tmux native paste-buffer for seamless integration
   */
  uploadFile(
    workspaceId: string,
    requestId: string,
    tabId: string,
    filename: string,
    data: string,
    mimeType: string
  ): boolean {
    return this.emit(workspaceId, 'file:upload', {
      requestId,
      tabId,
      filename,
      data,
      mimeType,
    });
  }

  /**
   * Request git status from the agent
   */
  gitStatus(workspaceId: string, requestId: string): boolean {
    return this.emit(workspaceId, 'git:status', { requestId });
  }

  /**
   * Request git diff from the agent
   */
  gitDiff(workspaceId: string, requestId: string, options?: { staged?: boolean; files?: string[] }): boolean {
    return this.emit(workspaceId, 'git:diff', { requestId, ...options });
  }

  /**
   * Request to stage files via the agent
   */
  gitStage(workspaceId: string, requestId: string, files: string[]): boolean {
    return this.emit(workspaceId, 'git:stage', { requestId, files });
  }

  /**
   * Request to unstage files via the agent
   */
  gitUnstage(workspaceId: string, requestId: string, files: string[]): boolean {
    return this.emit(workspaceId, 'git:unstage', { requestId, files });
  }

  /**
   * Request to commit changes via the agent
   */
  gitCommit(workspaceId: string, requestId: string, message: string): boolean {
    return this.emit(workspaceId, 'git:commit', { requestId, message });
  }

  /**
   * Request to discard changes via the agent
   */
  gitDiscard(workspaceId: string, requestId: string, files: string[]): boolean {
    return this.emit(workspaceId, 'git:discard', { requestId, files });
  }

  /**
   * Request docker status from the agent
   */
  dockerStatus(workspaceId: string, requestId: string): boolean {
    return this.emit(workspaceId, 'docker:status', { requestId });
  }

  /**
   * Request docker logs from the agent
   */
  dockerLogs(workspaceId: string, requestId: string, containerId: string, tail?: number): boolean {
    return this.emit(workspaceId, 'docker:logs', { requestId, containerId, tail });
  }

  /**
   * Request container stats from the agent
   */
  requestStats(workspaceId: string, requestId: string): boolean {
    return this.emit(workspaceId, 'stats:request', { requestId });
  }

  /**
   * Start a docker container via the agent
   */
  dockerStart(workspaceId: string, requestId: string, containerId: string): boolean {
    return this.emit(workspaceId, 'docker:start', { requestId, containerId });
  }

  /**
   * Stop a docker container via the agent
   */
  dockerStop(workspaceId: string, requestId: string, containerId: string): boolean {
    return this.emit(workspaceId, 'docker:stop', { requestId, containerId });
  }

  /**
   * Restart a docker container via the agent
   */
  dockerRestart(workspaceId: string, requestId: string, containerId: string): boolean {
    return this.emit(workspaceId, 'docker:restart', { requestId, containerId });
  }

  /**
   * Update tab state from agent
   */
  updateTabState(workspaceId: string, tabId: string, tmuxWindow: number, status: TabState['status']): void {
    const agent = this.agents.get(workspaceId);
    if (!agent) return;

    agent.tabs.set(tabId, { tabId, tmuxWindow, status });
  }

  /**
   * Remove tab state
   */
  removeTabState(workspaceId: string, tabId: string): void {
    const agent = this.agents.get(workspaceId);
    if (!agent) return;

    agent.tabs.delete(tabId);
  }

  /**
   * Get all connected agents
   */
  getAllAgents(): Array<{
    workspaceId: string;
    version: string;
    connectedAt: Date;
    lastHeartbeat: Date;
    tabCount: number;
  }> {
    return [...this.agents.values()].map(agent => ({
      workspaceId: agent.workspaceId,
      version: agent.version,
      connectedAt: agent.connectedAt,
      lastHeartbeat: agent.lastHeartbeat,
      tabCount: agent.tabs.size,
    }));
  }

  /**
   * Check if an agent version should be updated
   */
  private shouldUpdate(currentVersion: string, expectedVersion: string): boolean {
    const current = currentVersion.split('.').map(Number);
    const expected = expectedVersion.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const c = current[i] || 0;
      const e = expected[i] || 0;
      if (e > c) return true;
      if (e < c) return false;
    }

    return false;
  }

  /**
   * Get expected agent version
   */
  getExpectedVersion(): string {
    return EXPECTED_AGENT_VERSION;
  }
}

// Use global storage to ensure singleton works across Next.js module boundaries
// This is necessary because in development mode, API routes may run in different
// module contexts than the WebSocket server
declare global {
  // eslint-disable-next-line no-var
  var agentRegistryInstance: AgentRegistry | undefined;
}

export function getAgentRegistry(): AgentRegistry {
  if (!global.agentRegistryInstance) {
    global.agentRegistryInstance = new AgentRegistry();
  }
  return global.agentRegistryInstance;
}

export { AgentRegistry };
