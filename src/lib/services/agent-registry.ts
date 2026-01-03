/**
 * Agent Registry Service
 * Tracks connected sidecar agents and routes messages to them
 */

import type { Socket } from 'socket.io';
import { db } from '@/lib/db';
import { workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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
const EXPECTED_AGENT_VERSION = process.env.AGENT_VERSION || '1.0.0';

class AgentRegistry {
  private agents: Map<string, ConnectedAgent> = new Map();
  private socketToWorkspace: Map<string, string> = new Map();

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
    return this.emit(workspaceId, 'agent:update', {
      version: EXPECTED_AGENT_VERSION,
      bundleUrl,
    });
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

// Singleton instance
let agentRegistryInstance: AgentRegistry | null = null;

export function getAgentRegistry(): AgentRegistry {
  if (!agentRegistryInstance) {
    agentRegistryInstance = new AgentRegistry();
  }
  return agentRegistryInstance;
}

export { AgentRegistry };
