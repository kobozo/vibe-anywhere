/**
 * Workspace State Broadcaster
 * Broadcasts workspace and container state changes to connected clients via WebSocket
 */

import type { Server as SocketServer } from 'socket.io';
import type { ContainerStatus } from '@/lib/db/schema';
import type { StartupProgress } from '@/lib/types/startup-progress';
import { getSocketServer } from '@/lib/websocket/server';

interface WorkspaceStateUpdate {
  workspaceId: string;
  containerId?: string | null;
  containerStatus?: ContainerStatus;
  containerIp?: string | null;
  agentConnected?: boolean;
  agentVersion?: string | null;
  agentUpdating?: boolean;
}

class WorkspaceStateBroadcaster {
  private io: SocketServer | null = null;

  /**
   * Initialize the broadcaster with a Socket.io server instance
   * @deprecated Use getSocketServer() instead - kept for backwards compatibility
   */
  initialize(io: SocketServer): void {
    this.io = io;
    console.log('Workspace state broadcaster initialized');
  }

  /**
   * Get the Socket.io instance (checks both local and global)
   */
  private getIo(): SocketServer | null {
    // First check instance property (set by initialize())
    if (this.io) {
      return this.io;
    }
    // Fall back to global socket server (works across all contexts)
    return getSocketServer();
  }

  /**
   * Broadcast a workspace state update to all connected clients
   */
  broadcastWorkspaceUpdate(update: WorkspaceStateUpdate): void {
    const io = this.getIo();
    if (!io) {
      console.warn('Workspace state broadcaster not initialized');
      return;
    }

    console.log(`Broadcasting workspace update: ${update.workspaceId}`, update);
    io.emit('workspace:updated', update);
  }

  /**
   * Broadcast container status change
   */
  broadcastContainerStatus(
    workspaceId: string,
    containerId: string | null,
    containerStatus: ContainerStatus,
    containerIp?: string | null
  ): void {
    this.broadcastWorkspaceUpdate({
      workspaceId,
      containerId,
      containerStatus,
      containerIp,
    });
  }

  /**
   * Broadcast agent connection status change
   */
  broadcastAgentStatus(
    workspaceId: string,
    connected: boolean,
    version?: string | null
  ): void {
    this.broadcastWorkspaceUpdate({
      workspaceId,
      agentConnected: connected,
      agentVersion: version,
    });
  }

  /**
   * Broadcast agent updating status
   */
  broadcastAgentUpdating(workspaceId: string, updating: boolean): void {
    this.broadcastWorkspaceUpdate({
      workspaceId,
      agentUpdating: updating,
    });
  }

  /**
   * Broadcast startup progress update
   */
  broadcastStartupProgress(progress: StartupProgress): void {
    const io = this.getIo();
    if (!io) {
      console.warn('[Broadcaster] Socket server not initialized - cannot emit startup progress');
      return;
    }

    const connectedSockets = io.sockets.sockets.size;
    console.log(
      `[Broadcaster] Emitting startup progress: workspace=${progress.workspaceId}, step=${progress.currentStep}, connectedClients=${connectedSockets}`
    );
    io.emit('workspace:startup-progress', progress);
  }
}

// Singleton instance
let broadcasterInstance: WorkspaceStateBroadcaster | null = null;

export function getWorkspaceStateBroadcaster(): WorkspaceStateBroadcaster {
  if (!broadcasterInstance) {
    broadcasterInstance = new WorkspaceStateBroadcaster();
  }
  return broadcasterInstance;
}

export { WorkspaceStateBroadcaster };
