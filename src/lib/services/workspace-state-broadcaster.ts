/**
 * Workspace State Broadcaster
 * Broadcasts workspace and container state changes to connected clients via WebSocket
 */

import type { Server as SocketServer } from 'socket.io';
import type { ContainerStatus } from '@/lib/db/schema';

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
   */
  initialize(io: SocketServer): void {
    this.io = io;
    console.log('Workspace state broadcaster initialized');
  }

  /**
   * Broadcast a workspace state update to all connected clients
   */
  broadcastWorkspaceUpdate(update: WorkspaceStateUpdate): void {
    if (!this.io) {
      console.warn('Workspace state broadcaster not initialized');
      return;
    }

    console.log(`Broadcasting workspace update: ${update.workspaceId}`, update);
    this.io.emit('workspace:updated', update);
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
