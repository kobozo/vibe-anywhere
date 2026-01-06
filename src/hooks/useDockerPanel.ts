'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAgentDocker } from './useAgentDocker';
import type { DockerStatus, DockerContainer, DockerLogs } from '@/types/docker';

interface UseDockerPanelOptions {
  workspaceId: string | null;
  containerIp: string | null;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseDockerPanelReturn {
  // State
  status: DockerStatus | null;
  selectedContainer: DockerContainer | null;
  containerLogs: string | null;
  isLoading: boolean;
  isLoadingLogs: boolean;
  isActionPending: boolean;
  error: string | null;
  lastRefresh: Date | null;

  // Actions
  refresh: () => Promise<void>;
  selectContainer: (container: DockerContainer | null) => void;
  fetchLogs: (containerId: string, tail?: number) => Promise<void>;
  startContainer: (containerId: string) => Promise<void>;
  stopContainer: (containerId: string) => Promise<void>;
  restartContainer: (containerId: string) => Promise<void>;
  getPortUrl: (port: number) => string;
  clearError: () => void;
}

export function useDockerPanel({
  workspaceId,
  containerIp,
  autoRefresh = true,
  refreshInterval = 5000, // Docker status changes more frequently
}: UseDockerPanelOptions): UseDockerPanelReturn {
  const {
    getStatus,
    getLogs,
    startContainer: agentStart,
    stopContainer: agentStop,
    restartContainer: agentRestart,
    isConnected,
  } = useAgentDocker({ workspaceId });

  // State
  const [status, setStatus] = useState<DockerStatus | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<DockerContainer | null>(null);
  const [containerLogs, setContainerLogs] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch status
  const refresh = useCallback(async () => {
    if (!workspaceId || !isConnected) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const newStatus = await getStatus();
      if (mountedRef.current) {
        setStatus(newStatus);
        setLastRefresh(new Date());

        // Update selected container if it still exists
        if (selectedContainer) {
          const updated = newStatus.containers.find(c => c.id === selectedContainer.id);
          if (updated) {
            setSelectedContainer(updated);
          } else {
            // Container no longer exists
            setSelectedContainer(null);
            setContainerLogs(null);
          }
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to get Docker status');
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [workspaceId, isConnected, getStatus, selectedContainer]);

  // Initial fetch when workspace changes
  useEffect(() => {
    if (workspaceId && isConnected) {
      refresh();
    } else {
      setStatus(null);
      setSelectedContainer(null);
      setContainerLogs(null);
    }
  }, [workspaceId, isConnected]); // Don't include refresh to avoid infinite loop

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh || !workspaceId || !isConnected) {
      return;
    }

    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, workspaceId, isConnected, refresh]);

  // Select container
  const selectContainer = useCallback((container: DockerContainer | null) => {
    setSelectedContainer(container);
    setContainerLogs(null);
  }, []);

  // Fetch logs for a container
  const fetchLogs = useCallback(async (containerId: string, tail: number = 200) => {
    if (!workspaceId || !isConnected) {
      return;
    }

    setIsLoadingLogs(true);
    setError(null);

    try {
      const result = await getLogs(containerId, tail);
      if (mountedRef.current) {
        setContainerLogs(result.logs);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to get container logs');
      }
    } finally {
      if (mountedRef.current) {
        setIsLoadingLogs(false);
      }
    }
  }, [workspaceId, isConnected, getLogs]);

  // Start container
  const startContainer = useCallback(async (containerId: string) => {
    if (!workspaceId || !isConnected) {
      return;
    }

    setIsActionPending(true);
    setError(null);

    try {
      await agentStart(containerId);
      // Refresh after action
      await refresh();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to start container');
      }
    } finally {
      if (mountedRef.current) {
        setIsActionPending(false);
      }
    }
  }, [workspaceId, isConnected, agentStart, refresh]);

  // Stop container
  const stopContainer = useCallback(async (containerId: string) => {
    if (!workspaceId || !isConnected) {
      return;
    }

    setIsActionPending(true);
    setError(null);

    try {
      await agentStop(containerId);
      await refresh();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to stop container');
      }
    } finally {
      if (mountedRef.current) {
        setIsActionPending(false);
      }
    }
  }, [workspaceId, isConnected, agentStop, refresh]);

  // Restart container
  const restartContainer = useCallback(async (containerId: string) => {
    if (!workspaceId || !isConnected) {
      return;
    }

    setIsActionPending(true);
    setError(null);

    try {
      await agentRestart(containerId);
      await refresh();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to restart container');
      }
    } finally {
      if (mountedRef.current) {
        setIsActionPending(false);
      }
    }
  }, [workspaceId, isConnected, agentRestart, refresh]);

  // Get URL for a port
  const getPortUrl = useCallback((port: number): string => {
    if (!containerIp) {
      return `http://localhost:${port}`;
    }
    return `http://${containerIp}:${port}`;
  }, [containerIp]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    status,
    selectedContainer,
    containerLogs,
    isLoading,
    isLoadingLogs,
    isActionPending,
    error,
    lastRefresh,
    refresh,
    selectContainer,
    fetchLogs,
    startContainer,
    stopContainer,
    restartContainer,
    getPortUrl,
    clearError,
  };
}
