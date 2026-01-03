import type { ContainerStream } from '@/types/container';
import { getContainerService } from './container-service';
import { getTabService } from './tab-service';
import { getWorkspaceService } from './workspace-service';
import type { Socket } from 'socket.io';

interface TabStream {
  tabId: string;
  workspaceId: string;
  containerId: string;
  containerStream: ContainerStream;
  connectedSockets: Set<Socket>;
  isEnded: boolean;
}

/**
 * Manages persistent exec sessions for tabs.
 * Sessions survive client disconnects and can be reconnected to.
 */
class TabStreamManager {
  private streams: Map<string, TabStream> = new Map();

  /**
   * Attach a socket to a tab's stream.
   * Creates the stream if it doesn't exist, or reconnects to existing one.
   */
  async attach(socket: Socket, tabId: string): Promise<void> {
    const tabService = getTabService();
    const workspaceService = getWorkspaceService();
    const containerService = getContainerService();

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

    // Check if we have an existing stream for this tab
    let tabStream = this.streams.get(tabId);

    if (tabStream && !tabStream.isEnded) {
      // Reconnect to existing stream
      console.log(`Reconnecting socket ${socket.id} to existing stream for tab ${tabId}`);

      // Send buffered output first
      const buffer = await tabService.getOutputBuffer(tabId);
      if (buffer.length > 0) {
        socket.emit('terminal:buffer', { lines: buffer });
      }

      // Add socket to connected sockets
      tabStream.connectedSockets.add(socket);

      // Notify client
      socket.emit('tab:attached', { tabId, reconnected: true });
      return;
    }

    // Create new stream
    console.log(`Creating new stream for tab ${tabId}`);

    // Send any existing buffer first (from previous session)
    const buffer = await tabService.getOutputBuffer(tabId);
    if (buffer.length > 0) {
      socket.emit('terminal:buffer', { lines: buffer });
    }

    // Execute the tab's command
    const command = tab.command || ['/bin/bash'];
    console.log('Executing tab command:', command, 'in container:', workspace.containerId);

    const containerStream = await containerService.execCommand(workspace.containerId, command);

    // Create tab stream entry
    tabStream = {
      tabId,
      workspaceId: workspace.id,
      containerId: workspace.containerId,
      containerStream,
      connectedSockets: new Set([socket]),
      isEnded: false,
    };

    this.streams.set(tabId, tabStream);

    // Handle stream output - broadcast to all connected sockets and buffer
    containerStream.stream.on('data', async (chunk: Buffer) => {
      const data = chunk.toString();

      // Buffer the output
      await tabService.appendOutput(tabId, data);

      // Broadcast to all connected sockets
      for (const connectedSocket of tabStream!.connectedSockets) {
        connectedSocket.emit('terminal:output', { data });
      }
    });

    // Handle stream end
    containerStream.stream.on('end', async () => {
      console.log(`Stream ended for tab ${tabId}`);
      tabStream!.isEnded = true;

      // Notify all connected sockets
      for (const connectedSocket of tabStream!.connectedSockets) {
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
      for (const connectedSocket of tabStream!.connectedSockets) {
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
    if (tabStream && !tabStream.isEnded) {
      tabStream.containerStream.stream.write(data);
      return true;
    }
    return false;
  }

  /**
   * Resize the terminal for a tab.
   */
  async resize(tabId: string, cols: number, rows: number): Promise<void> {
    const tabStream = this.streams.get(tabId);
    if (tabStream && !tabStream.isEnded) {
      // Use the exec's resize method (resizes the specific exec session's PTY)
      await tabStream.containerStream.resize(cols, rows);
    }
  }

  /**
   * Stop a tab's stream.
   */
  async stop(tabId: string): Promise<void> {
    const tabStream = this.streams.get(tabId);
    if (tabStream) {
      await tabStream.containerStream.close();
      tabStream.isEnded = true;
      this.streams.delete(tabId);
    }
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
}

// Singleton instance
let tabStreamManagerInstance: TabStreamManager | null = null;

export function getTabStreamManager(): TabStreamManager {
  if (!tabStreamManagerInstance) {
    tabStreamManagerInstance = new TabStreamManager();
  }
  return tabStreamManagerInstance;
}
