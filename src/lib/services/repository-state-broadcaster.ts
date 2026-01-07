/**
 * Repository State Broadcaster
 * Broadcasts repository state changes to connected clients via WebSocket
 */

import type { Server as SocketServer } from 'socket.io';
import { getSocketServer } from '@/lib/websocket/server';

export interface RepositoryBranchUpdate {
  repositoryId: string;
  branches: string[];
  defaultBranch: string | null;
  cachedAt: string;
}

class RepositoryStateBroadcaster {
  private io: SocketServer | null = null;

  /**
   * Initialize the broadcaster with a Socket.io server instance
   * @deprecated Use getSocketServer() instead - kept for backwards compatibility
   */
  initialize(io: SocketServer): void {
    this.io = io;
    console.log('Repository state broadcaster initialized');
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
   * Broadcast a branch update to all connected clients
   */
  broadcastBranchUpdate(update: RepositoryBranchUpdate): void {
    const io = this.getIo();
    if (!io) {
      console.warn('Repository state broadcaster not initialized - cannot emit branch update');
      return;
    }

    const connectedSockets = io.sockets.sockets.size;
    console.log(
      `[Broadcaster] Emitting branch update: repository=${update.repositoryId}, branches=${update.branches.length}, connectedClients=${connectedSockets}`
    );
    io.emit('repository:branches-updated', update);
  }
}

// Singleton instance
let broadcasterInstance: RepositoryStateBroadcaster | null = null;

export function getRepositoryStateBroadcaster(): RepositoryStateBroadcaster {
  if (!broadcasterInstance) {
    broadcasterInstance = new RepositoryStateBroadcaster();
  }
  return broadcasterInstance;
}

export { RepositoryStateBroadcaster };
