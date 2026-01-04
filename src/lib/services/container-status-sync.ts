/**
 * Container Status Sync Service
 * Periodically checks container status on the backend (Proxmox/Docker)
 * and syncs any changes to the database and broadcasts via WebSocket.
 *
 * This catches cases where containers are manually stopped/deleted in Proxmox.
 */

import { db } from '@/lib/db';
import { workspaces, type ContainerStatus } from '@/lib/db/schema';
import { eq, isNotNull, and, ne } from 'drizzle-orm';
import { getContainerBackendAsync, type IContainerBackend } from '@/lib/container';
import { getWorkspaceStateBroadcaster } from './workspace-state-broadcaster';
import { getAgentRegistry } from './agent-registry';

// How often to check container status (in milliseconds)
const SYNC_INTERVAL = 30000; // 30 seconds

class ContainerStatusSyncService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private containerBackend: IContainerBackend | null = null;

  /**
   * Start the periodic sync service
   */
  async start(): Promise<void> {
    if (this.intervalId) {
      console.log('Container status sync service already running');
      return;
    }

    // Initialize the container backend
    try {
      this.containerBackend = await getContainerBackendAsync();
    } catch (error) {
      console.error('Failed to initialize container backend for status sync:', error);
      return;
    }

    console.log(`Container status sync service starting (interval: ${SYNC_INTERVAL}ms)`);

    // Run immediately on start
    await this.syncAllContainers();

    // Then schedule periodic checks
    this.intervalId = setInterval(async () => {
      await this.syncAllContainers();
    }, SYNC_INTERVAL);
  }

  /**
   * Stop the periodic sync service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Container status sync service stopped');
    }
  }

  /**
   * Sync status for all containers
   */
  private async syncAllContainers(): Promise<void> {
    if (this.isRunning) {
      console.log('Container status sync already in progress, skipping');
      return;
    }

    this.isRunning = true;

    try {
      // Get all workspaces with containers
      const workspacesWithContainers = await db
        .select()
        .from(workspaces)
        .where(
          and(
            isNotNull(workspaces.containerId),
            ne(workspaces.containerStatus, 'none')
          )
        );

      console.log(`Container status sync: checking ${workspacesWithContainers.length} workspaces`);

      if (workspacesWithContainers.length === 0) {
        return;
      }

      const broadcaster = getWorkspaceStateBroadcaster();
      const agentRegistry = getAgentRegistry();

      for (const workspace of workspacesWithContainers) {
        try {
          await this.syncContainerStatus(workspace, broadcaster, agentRegistry);
        } catch (error) {
          console.error(`Error syncing container status for workspace ${workspace.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in container status sync:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sync status for a single container
   */
  private async syncContainerStatus(
    workspace: typeof workspaces.$inferSelect,
    broadcaster: ReturnType<typeof getWorkspaceStateBroadcaster>,
    agentRegistry: ReturnType<typeof getAgentRegistry>
  ): Promise<void> {
    if (!this.containerBackend || !workspace.containerId) {
      return;
    }

    // Get actual container status from backend
    const containerInfo = await this.containerBackend.getContainerInfo(workspace.containerId);

    let newStatus: ContainerStatus;
    let newContainerId: string | null = workspace.containerId;
    let newContainerIp: string | null = workspace.containerIp;

    if (!containerInfo) {
      // Container no longer exists in backend
      newStatus = 'none';
      newContainerId = null;
      newContainerIp = null;
    } else {
      // Map backend status to our status
      newStatus = this.mapContainerStatus(containerInfo.status);
      newContainerIp = containerInfo.ipAddress || null;
    }

    // Check if anything changed
    const statusChanged = newStatus !== workspace.containerStatus;
    const containerIdChanged = newContainerId !== workspace.containerId;
    const ipChanged = newContainerIp !== workspace.containerIp;

    console.log(`  Workspace ${workspace.id}: backend=${newStatus}, db=${workspace.containerStatus}, changed=${statusChanged}`);

    if (!statusChanged && !containerIdChanged && !ipChanged) {
      return; // No changes
    }

    console.log(
      `Container status changed for workspace ${workspace.id}: ` +
      `${workspace.containerStatus} -> ${newStatus} ` +
      `(containerId: ${workspace.containerId} -> ${newContainerId})`
    );

    // Update database
    await db
      .update(workspaces)
      .set({
        containerId: newContainerId,
        containerStatus: newStatus,
        containerIp: newContainerIp,
        updatedAt: new Date(),
        // Clear agent info if container is gone
        ...(newStatus === 'none' ? {
          agentConnectedAt: null,
        } : {}),
      })
      .where(eq(workspaces.id, workspace.id));

    // Broadcast the change
    broadcaster.broadcastContainerStatus(
      workspace.id,
      newContainerId,
      newStatus,
      newContainerIp
    );

    // If container is gone, also broadcast agent disconnection
    if (newStatus === 'none' && workspace.agentConnectedAt) {
      broadcaster.broadcastAgentStatus(workspace.id, false);
    }
  }

  /**
   * Map backend container status to our ContainerStatus type
   */
  private mapContainerStatus(backendStatus: string): ContainerStatus {
    switch (backendStatus) {
      case 'running':
        return 'running';
      case 'paused':
        return 'paused';
      case 'exited':
        return 'exited';
      case 'dead':
        return 'dead';
      case 'created':
        return 'creating';
      case 'removing':
        return 'exited';
      default:
        return 'none';
    }
  }

  /**
   * Manually trigger a sync (for testing or on-demand checks)
   */
  async syncNow(): Promise<void> {
    await this.syncAllContainers();
  }
}

// Singleton instance
let syncServiceInstance: ContainerStatusSyncService | null = null;

export function getContainerStatusSyncService(): ContainerStatusSyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new ContainerStatusSyncService();
  }
  return syncServiceInstance;
}

export { ContainerStatusSyncService };
