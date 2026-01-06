'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { useStartupProgress } from '@/hooks/useStartupProgress';
import { useWorkspaceState, WorkspaceStateUpdate } from '@/hooks/useWorkspaceState';
import { StartupProgress, WorkspaceStopped } from './startup-progress';
import type { Workspace } from '@/lib/db/schema';

interface WorkspaceContentProps {
  workspace: Workspace;
  children: React.ReactNode;
  onContainerStart?: () => void;
  onContainerStatusChange?: (status: string, agentConnected: boolean) => void;
}

/**
 * Wrapper component that handles container startup state
 * Shows startup progress or "Start Container" button when container is not ready
 */
export function WorkspaceContent({
  workspace,
  children,
  onContainerStart,
  onContainerStatusChange,
}: WorkspaceContentProps) {
  // Track container status locally for real-time updates
  const [containerStatus, setContainerStatus] = useState(workspace.containerStatus);
  const [agentConnected, setAgentConnected] = useState(!!workspace.agentConnectedAt);
  const [isManuallyStarting, setIsManuallyStarting] = useState(false);
  const startTimeRef = useRef<number | null>(null);

  // Update local state when workspace prop changes (workspace switch)
  useEffect(() => {
    console.log('[WorkspaceContent] Workspace changed:', {
      id: workspace.id,
      containerStatus: workspace.containerStatus,
      agentConnectedAt: workspace.agentConnectedAt,
    });
    setContainerStatus(workspace.containerStatus);
    setAgentConnected(!!workspace.agentConnectedAt);
    setIsManuallyStarting(false);
    startTimeRef.current = null;
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
          // When agent connects, startup is complete and container must be running
          if (update.agentConnected) {
            console.log('[WorkspaceContent] Agent connected - startup complete');
            setIsManuallyStarting(false);
            startTimeRef.current = null;
            // Agent can only connect if container is running - sync the status
            setContainerStatus('running');
          }
        }
        onContainerStatusChange?.(
          update.containerStatus ?? containerStatus,
          update.agentConnected ?? agentConnected
        );
      },
      [containerStatus, agentConnected, onContainerStatusChange]
    ),
  });

  // Subscribe to startup progress (for displaying actual progress steps)
  const { progress, isStarting: hasActiveProgress, hasError } = useStartupProgress({
    workspaceId: workspace.id,
  });

  // Log progress updates
  useEffect(() => {
    if (progress) {
      console.log('[WorkspaceContent] Progress update:', progress);
    }
  }, [progress]);

  // Handle manual start
  const handleStart = useCallback(async () => {
    console.log('[WorkspaceContent] Starting container...');
    setIsManuallyStarting(true);
    startTimeRef.current = Date.now();

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });

      const data = await response.json();
      console.log('[WorkspaceContent] Start API response:', data);

      if (!response.ok) {
        // If container is already running, that's okay - wait for agent
        if (data.error?.message?.includes('already running')) {
          console.log('[WorkspaceContent] Container already running, waiting for agent...');
          return;
        }
        throw new Error(data.error?.message || 'Failed to start container');
      }

      console.log('[WorkspaceContent] Container started, waiting for agent connection...');
      onContainerStart?.();
    } catch (error) {
      console.error('[WorkspaceContent] Failed to start container:', error);
      setIsManuallyStarting(false);
      startTimeRef.current = null;
    }
  }, [workspace.id, onContainerStart]);

  // Handle retry after error
  const handleRetry = useCallback(() => {
    handleStart();
  }, [handleStart]);

  // Determine states
  const isContainerRunning = containerStatus === 'running';
  // Agent can only connect if container is running, so agentConnected implies container is ready
  // (handles race condition where agent connects before containerStatus updates to 'running')
  const isContainerReady = agentConnected;

  // Debug logging
  console.log('[WorkspaceContent] Render:', {
    containerStatus,
    agentConnected,
    isManuallyStarting,
    hasActiveProgress,
    hasError,
    progressStep: progress?.currentStep,
    isContainerReady,
  });

  // PRIORITY 1: Container is fully ready (running + agent connected) - show children
  if (isContainerReady) {
    return <>{children}</>;
  }

  // PRIORITY 2: We're in a manual start process - show progress UI
  // This takes priority over everything else to avoid flickering
  if (isManuallyStarting) {
    return (
      <StartupProgress
        workspaceId={workspace.id}
        onRetry={handleRetry}
      />
    );
  }

  // PRIORITY 3: We have active server-side progress - show it
  if (hasActiveProgress || (progress && !hasError && progress.currentStep !== 'ready')) {
    return (
      <StartupProgress
        workspaceId={workspace.id}
        onRetry={handleRetry}
      />
    );
  }

  // PRIORITY 4: Show error state with retry
  if (hasError) {
    return (
      <StartupProgress
        workspaceId={workspace.id}
        onRetry={handleRetry}
      />
    );
  }

  // PRIORITY 5: Container is running but agent not connected - show connecting state
  if (isContainerRunning && !agentConnected) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-background-secondary text-foreground-tertiary gap-4">
        <div className="text-center">
          <h3 className="text-lg font-medium text-foreground-secondary mb-2">
            Connecting to Agent
          </h3>
          <p className="text-sm mb-4">
            Container is running, waiting for agent connection...
          </p>
          <div className="flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  // PRIORITY 6: Container not running - show start button
  return (
    <WorkspaceStopped
      onStart={handleStart}
      isStarting={false}
    />
  );
}
