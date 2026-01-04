'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from './useSocket';
import { useAuth } from './useAuth';
import type { ContainerStatus } from '@/lib/db/schema';

interface WorkspaceStateUpdate {
  workspaceId: string;
  containerId?: string | null;
  containerStatus?: ContainerStatus;
  containerIp?: string | null;
  agentConnected?: boolean;
  agentVersion?: string | null;
}

interface UseWorkspaceStateOptions {
  /**
   * Optional list of workspace IDs to filter updates for.
   * If not provided, all workspace updates will be received.
   */
  workspaceIds?: string[];
  /**
   * Callback for workspace state updates
   */
  onUpdate?: (update: WorkspaceStateUpdate) => void;
}

/**
 * Hook to subscribe to real-time workspace state updates
 */
export function useWorkspaceState(options: UseWorkspaceStateOptions = {}) {
  const { workspaceIds, onUpdate } = options;
  const { token } = useAuth();
  const onUpdateRef = useRef(onUpdate);

  // Keep ref in sync with callback
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const handleWorkspaceUpdate = useCallback((update: WorkspaceStateUpdate) => {
    // Filter by workspace IDs if specified
    if (workspaceIds && !workspaceIds.includes(update.workspaceId)) {
      return;
    }

    console.log('Workspace state update received:', update);
    onUpdateRef.current?.(update);
  }, [workspaceIds]);

  const { socket, isConnected } = useSocket({
    token,
    onConnect: () => {
      console.log('Workspace state hook connected');
    },
    onDisconnect: () => {
      console.log('Workspace state hook disconnected');
    },
  });

  // Subscribe to workspace updates
  useEffect(() => {
    if (!socket) return;

    socket.on('workspace:updated', handleWorkspaceUpdate);

    return () => {
      socket.off('workspace:updated', handleWorkspaceUpdate);
    };
  }, [socket, handleWorkspaceUpdate]);

  return {
    isConnected,
    socket,
  };
}
