import { getContainerBackendAsync, getBackendType, type ContainerStream } from '@/lib/container';
import { getTabService } from './tab-service';
import { getWorkspaceService } from './workspace-service';
import { getAgentRegistry } from './agent-registry';
import type { Socket } from 'socket.io';

interface TabStream {
  tabId: string;
  workspaceId: string;
  containerId: string;
  containerStream: ContainerStream | null; // null for agent-based streams
  connectedSockets: Set<Socket>;
  isEnded: boolean;
  useAgent: boolean; // true for Proxmox/agent-based, false for Docker/direct
  pendingCreate?: boolean; // waiting for agent to create tab
}

/**
 * Manages persistent exec sessions for tabs.
 * Sessions survive client disconnects and can be reconnected to.
 * Supports both direct Docker streams and agent-based Proxmox streams.
 */
class TabStreamManager {
  private streams: Map<string, TabStream> = new Map();

  /**
   * Attach a socket to a tab's stream.
   * Creates the stream if it doesn't exist, or reconnects to existing one.
   */
  async attach(socket: Socket, tabId: string): Promise<void> {
    const tabService = getTabService();
    const workspaceService = await getWorkspaceService();

    // Get tab info
    const tab = await tabService.getTab(tabId);
    if (!tab) {
      throw new Error('Tab not found');
    }

    // Get workspace for container info
    const workspace = await workspaceService.getWorkspace(tab.workspaceId);
    if (!workspace || !workspace.containerId) {
      throw new Error('Workspace container not found');
    }

    // Determine if we should use agent-based communication
    const useAgent = workspace.containerBackend === 'proxmox';

    // Check if we have an existing stream for this tab
    let tabStream = this.streams.get(tabId);

    if (tabStream && !tabStream.isEnded) {
      // Reconnect to existing stream
      console.log(`Reconnecting socket ${socket.id} to existing stream for tab ${tabId}`);

      if (useAgent) {
        // Request buffer from agent
        const agentRegistry = getAgentRegistry();
        if (agentRegistry.hasAgent(workspace.id)) {
          agentRegistry.requestBuffer(workspace.id, tabId, 1000);
        }
      } else {
        // Send buffered output from database
        const buffer = await tabService.getOutputBuffer(tabId);
        if (buffer.length > 0) {
          socket.emit('terminal:buffer', { lines: buffer });
        }
      }

      // Add socket to connected sockets
      tabStream.connectedSockets.add(socket);

      // Notify client
      socket.emit('tab:attached', { tabId, reconnected: true });
      return;
    }

    // Create new stream
    console.log(`Creating new stream for tab ${tabId} (useAgent: ${useAgent})`);

    // Send any existing buffer first (from previous session)
    const buffer = await tabService.getOutputBuffer(tabId);
    if (buffer.length > 0) {
      socket.emit('terminal:buffer', { lines: buffer });
    }

    // Build the command, wrapping with && exit if exitOnClose is enabled
    let command = tab.command || ['/bin/bash'];
    if (tab.exitOnClose && command.length > 0) {
      // Wrap command to exit when it finishes: /bin/bash -c "command args && exit"
      const cmdString = command.map(arg =>
        arg.includes(' ') || arg.includes('"') ? `'${arg.replace(/'/g, "'\\''")}'` : arg
      ).join(' ');
      command = ['/bin/bash', '-c', `${cmdString} && exit`];
    }

    if (useAgent) {
      // Agent-based: Request agent to create the tab
      await this.attachViaAgent(socket, tabId, workspace.id, workspace.containerId, command);
    } else {
      // Docker-based: Direct stream
      await this.attachViaDirect(socket, tabId, workspace.id, workspace.containerId, command);
    }
  }

  /**
   * Attach via agent (Proxmox)
   */
  private async attachViaAgent(
    socket: Socket,
    tabId: string,
    workspaceId: string,
    containerId: string,
    command: string[]
  ): Promise<void> {
    const agentRegistry = getAgentRegistry();

    // Check if agent is connected
    if (!agentRegistry.hasAgent(workspaceId)) {
      throw new Error('Workspace agent not connected. Please wait for the container to initialize.');
    }

    // Create tab stream entry (without containerStream)
    const tabStream: TabStream = {
      tabId,
      workspaceId,
      containerId,
      containerStream: null,
      connectedSockets: new Set([socket]),
      isEnded: false,
      useAgent: true,
      pendingCreate: true,
    };

    this.streams.set(tabId, tabStream);

    // Request agent to create the tab
    console.log('Requesting agent to create tab:', tabId, 'with command:', command);
    const sent = agentRegistry.createTab(workspaceId, tabId, command);

    if (!sent) {
      this.streams.delete(tabId);
      throw new Error('Failed to send create request to agent');
    }

    // Notify client (tab is being created)
    socket.emit('tab:attached', { tabId, reconnected: false, pending: true });
  }

  /**
   * Attach via direct Docker stream
   */
  private async attachViaDirect(
    socket: Socket,
    tabId: string,
    workspaceId: string,
    containerId: string,
    command: string[]
  ): Promise<void> {
    const tabService = getTabService();
    const containerBackend = await getContainerBackendAsync();

    console.log('Executing tab command:', command, 'in container:', containerId);

    const containerStream = await containerBackend.execCommand(containerId, command);

    // Create tab stream entry
    const tabStream: TabStream = {
      tabId,
      workspaceId,
      containerId,
      containerStream,
      connectedSockets: new Set([socket]),
      isEnded: false,
      useAgent: false,
    };

    this.streams.set(tabId, tabStream);

    // Handle stream output - broadcast to all connected sockets and buffer
    containerStream.stream.on('data', async (chunk: Buffer) => {
      const data = chunk.toString();

      // Buffer the output
      await tabService.appendOutput(tabId, data);

      // Broadcast to all connected sockets
      for (const connectedSocket of tabStream.connectedSockets) {
        connectedSocket.emit('terminal:output', { data });
      }
    });

    // Handle stream end
    containerStream.stream.on('end', async () => {
      console.log(`Stream ended for tab ${tabId}`);
      tabStream.isEnded = true;

      // Notify all connected sockets
      for (const connectedSocket of tabStream.connectedSockets) {
        connectedSocket.emit('terminal:end', { message: 'Session ended' });
      }

      // Update tab status
      await tabService.updateTab(tabId, { status: 'stopped' });

      // Clean up after a delay (allow reconnection attempts)
      setTimeout(() => {
        const stream = this.streams.get(tabId);
        if (stream?.isEnded) {
          this.streams.delete(tabId);
        }
      }, 5000);
    });

    // Handle stream errors
    containerStream.stream.on('error', (error: Error) => {
      console.error('Container stream error for tab', tabId, ':', error);

      // Notify all connected sockets
      for (const connectedSocket of tabStream.connectedSockets) {
        connectedSocket.emit('error', { message: 'Terminal connection error' });
      }
    });

    // Notify client
    socket.emit('tab:attached', { tabId, reconnected: false });
  }

  /**
   * Detach a socket from a tab's stream.
   * The stream keeps running for potential reconnection.
   */
  detach(socket: Socket, tabId: string): void {
    const tabStream = this.streams.get(tabId);
    if (tabStream) {
      tabStream.connectedSockets.delete(socket);
      console.log(`Socket ${socket.id} detached from tab ${tabId}. ${tabStream.connectedSockets.size} sockets remaining.`);
    }
  }

  /**
   * Detach a socket from all tabs it's connected to.
   */
  detachFromAll(socket: Socket): void {
    for (const [tabId, tabStream] of this.streams) {
      if (tabStream.connectedSockets.has(socket)) {
        tabStream.connectedSockets.delete(socket);
        console.log(`Socket ${socket.id} detached from tab ${tabId} on disconnect.`);
      }
    }
  }

  /**
   * Send input to a tab's stream.
   */
  sendInput(tabId: string, data: string): boolean {
    const tabStream = this.streams.get(tabId);
    if (!tabStream || tabStream.isEnded) {
      return false;
    }

    if (tabStream.useAgent) {
      // Route through agent
      const agentRegistry = getAgentRegistry();
      return agentRegistry.sendInput(tabStream.workspaceId, tabId, data);
    } else {
      // Direct stream
      if (tabStream.containerStream) {
        tabStream.containerStream.stream.write(data);
        return true;
      }
      return false;
    }
  }

  /**
   * Resize the terminal for a tab.
   */
  async resize(tabId: string, cols: number, rows: number): Promise<void> {
    const tabStream = this.streams.get(tabId);
    if (!tabStream || tabStream.isEnded) {
      return;
    }

    if (tabStream.useAgent) {
      // Route through agent
      const agentRegistry = getAgentRegistry();
      agentRegistry.resizeTab(tabStream.workspaceId, tabId, cols, rows);
    } else {
      // Direct stream
      if (tabStream.containerStream) {
        await tabStream.containerStream.resize(cols, rows);
      }
    }
  }

  /**
   * Stop a tab's stream.
   */
  async stop(tabId: string): Promise<void> {
    const tabStream = this.streams.get(tabId);
    if (!tabStream) {
      return;
    }

    if (tabStream.useAgent) {
      // Request agent to close the tab
      const agentRegistry = getAgentRegistry();
      agentRegistry.closeTab(tabStream.workspaceId, tabId);
    } else {
      // Close direct stream
      if (tabStream.containerStream) {
        await tabStream.containerStream.close();
      }
    }

    tabStream.isEnded = true;
    this.streams.delete(tabId);
  }

  /**
   * Check if a tab has an active stream.
   */
  hasActiveStream(tabId: string): boolean {
    const tabStream = this.streams.get(tabId);
    return tabStream !== undefined && !tabStream.isEnded;
  }

  /**
   * Get the number of connected sockets for a tab.
   */
  getConnectedCount(tabId: string): number {
    const tabStream = this.streams.get(tabId);
    return tabStream?.connectedSockets.size || 0;
  }

  /**
   * Close all streams for a workspace.
   * Used when destroying a container.
   */
  async closeAllForWorkspace(workspaceId: string): Promise<void> {
    const tabsToClose: string[] = [];

    for (const [tabId, tabStream] of this.streams) {
      if (tabStream.workspaceId === workspaceId) {
        tabsToClose.push(tabId);
      }
    }

    for (const tabId of tabsToClose) {
      await this.stop(tabId);
    }

    console.log(`Closed ${tabsToClose.length} streams for workspace ${workspaceId}`);
  }

  // =========================================
  // Agent callback methods
  // Called by the agent namespace handler
  // =========================================

  /**
   * Broadcast output from agent to all connected sockets
   */
  broadcastOutput(tabId: string, data: string): void {
    const tabStream = this.streams.get(tabId);
    if (!tabStream) return;

    // Buffer the output
    const tabService = getTabService();
    tabService.appendOutput(tabId, data).catch(console.error);

    // Broadcast to all connected sockets
    for (const socket of tabStream.connectedSockets) {
      socket.emit('terminal:output', { data });
    }
  }

  /**
   * Notify that a tab was successfully created by the agent
   */
  notifyTabCreated(tabId: string): void {
    const tabStream = this.streams.get(tabId);
    if (!tabStream) return;

    tabStream.pendingCreate = false;

    // Notify all connected sockets
    for (const socket of tabStream.connectedSockets) {
      socket.emit('tab:ready', { tabId });
    }
  }

  /**
   * Notify that a tab ended
   */
  async notifyTabEnded(tabId: string, exitCode: number): Promise<void> {
    const tabStream = this.streams.get(tabId);
    if (!tabStream) return;

    tabStream.isEnded = true;

    // Notify all connected sockets
    for (const socket of tabStream.connectedSockets) {
      socket.emit('terminal:end', { message: `Session ended (exit code: ${exitCode})` });
    }

    // Update tab status
    const tabService = getTabService();
    await tabService.updateTab(tabId, { status: 'stopped' });

    // Clean up after a delay
    setTimeout(() => {
      const stream = this.streams.get(tabId);
      if (stream?.isEnded) {
        this.streams.delete(tabId);
      }
    }, 5000);
  }

  /**
   * Send buffer to connected sockets (from agent)
   */
  sendBuffer(tabId: string, lines: string[]): void {
    const tabStream = this.streams.get(tabId);
    if (!tabStream) return;

    for (const socket of tabStream.connectedSockets) {
      socket.emit('terminal:buffer', { lines });
    }
  }

  /**
   * Notify an error occurred
   */
  notifyError(tabId: string, message: string): void {
    const tabStream = this.streams.get(tabId);
    if (!tabStream) return;

    for (const socket of tabStream.connectedSockets) {
      socket.emit('error', { message });
    }
  }
}

// Singleton instance
let tabStreamManagerInstance: TabStreamManager | null = null;

export function getTabStreamManager(): TabStreamManager {
  if (!tabStreamManagerInstance) {
    tabStreamManagerInstance = new TabStreamManager();
  }
  return tabStreamManagerInstance;
}
