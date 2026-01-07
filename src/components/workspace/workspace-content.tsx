'use client';

import { useCallback, useState, useEffect } from 'react';
import { useStartupProgress } from '@/hooks/useStartupProgress';
import { useWorkspaceState, WorkspaceStateUpdate } from '@/hooks/useWorkspaceState';
import { StartupProgress } from './startup-progress';
import type { Workspace } from '@/lib/db/schema';

// Operations that show progress UI (deploy creates container, redeploy recreates it)
export type ContainerOperation = 'deploy' | 'redeploy' | null;

interface WorkspaceContentProps {
  workspace: Workspace;
  children: React.ReactNode;
  activeOperation?: ContainerOperation;
  onOperationComplete?: () => void;
  onContainerStatusChange?: (status: string, agentConnected: boolean) => void;
}

/**
 * Wrapper component that handles container startup state
 * Shows startup progress when an operation (deploy/redeploy) is in progress
 * Shows children (Dashboard/terminals) for all other states
 */
export function WorkspaceContent({
  workspace,
  children,
  activeOperation,
  onOperationComplete,
  onContainerStatusChange,
}: WorkspaceContentProps) {
  // Track container status locally for real-time updates
  const [containerStatus, setContainerStatus] = useState(workspace.containerStatus);
  const [agentConnected, setAgentConnected] = useState(!!workspace.agentConnectedAt);

  // Update local state when workspace prop changes (workspace switch)
  useEffect(() => {
    console.log('[WorkspaceContent] Workspace changed:', {
      id: workspace.id,
      containerStatus: workspace.containerStatus,
      agentConnectedAt: workspace.agentConnectedAt,
    });
    setContainerStatus(workspace.containerStatus);
    setAgentConnected(!!workspace.agentConnectedAt);
  }, [workspace.id, workspace.containerStatus, workspace.agentConnectedAt]);

  // Subscribe to workspace state updates
  useWorkspaceState({
    workspaceIds: [workspace.id],
    onUpdate: useCallback(
      (update: WorkspaceStateUpdate) => {
        console.log('[WorkspaceContent] Workspace update:', update);
        if (update.containerStatus !== undefined) {
          setContainerStatus(update.containerStatus);
        }
        if (update.agentConnected !== undefined) {
          setAgentConnected(update.agentConnected);
          // When agent connects, startup is complete
          if (update.agentConnected) {
            console.log('[WorkspaceContent] Agent connected - operation complete');
            // Agent can only connect if container is running - sync the status
            setContainerStatus('running');
            // Notify parent that operation is complete
            onOperationComplete?.();
          }
        }
        onContainerStatusChange?.(
          update.containerStatus ?? containerStatus,
          update.agentConnected ?? agentConnected
        );
      },
      [containerStatus, agentConnected, onContainerStatusChange, onOperationComplete]
    ),
  });

  // Subscribe to startup progress (for displaying actual progress steps)
  const { hasError } = useStartupProgress({
    workspaceId: workspace.id,
  });

  // Agent can only connect if container is running, so agentConnected implies container is ready
  const isContainerReady = agentConnected;

  // Debug logging
  console.log('[WorkspaceContent] Render:', {
    containerStatus,
    agentConnected,
    activeOperation,
    hasError,
    isContainerReady,
  });

  // PRIORITY 1: Container is fully ready (running + agent connected) - show children
  if (isContainerReady) {
    return <>{children}</>;
  }

  // PRIORITY 2: Active progress operation (deploy/redeploy) - show StartupProgress
  if (activeOperation) {
    return (
      <StartupProgress
        workspaceId={workspace.id}
        onRetry={() => {
          // Clear operation on retry - user can click Deploy again
          onOperationComplete?.();
        }}
      />
    );
  }

  // PRIORITY 3: Show error state during progress operation
  if (hasError && (containerStatus === 'creating' || containerStatus === 'running')) {
    return (
      <StartupProgress
        workspaceId={workspace.id}
        onRetry={() => onOperationComplete?.()}
      />
    );
  }

  // PRIORITY 4: All other cases - show children
  // Dashboard has Start/Deploy/Restart/Shutdown/Destroy buttons
  // Terminals show "Stopped" message when container not running
  return <>{children}</>;
}
