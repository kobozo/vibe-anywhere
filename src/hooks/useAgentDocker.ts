'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSocket } from './useSocket';
import type { DockerStatus, DockerLogs, DockerOperationResponse } from '@/types/docker';

interface UseAgentDockerOptions {
  workspaceId: string | null;
}

interface UseAgentDockerReturn {
  getStatus: () => Promise<DockerStatus>;
  getLogs: (containerId: string, tail?: number) => Promise<DockerLogs>;
  startContainer: (containerId: string) => Promise<void>;
  stopContainer: (containerId: string) => Promise<void>;
  restartContainer: (containerId: string) => Promise<void>;
  isConnected: boolean;
}

// Generate unique request IDs
function generateRequestId(): string {
  return `docker-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useAgentDocker({ workspaceId }: UseAgentDockerOptions): UseAgentDockerReturn {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const { socket, isConnected } = useSocket({ token });

  // Map to store pending request callbacks
  const pendingRequests = useRef<Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>>(new Map());

  // Set up response listeners
  useEffect(() => {
    if (!socket) return;

    const handleStatusResponse = (data: DockerOperationResponse<DockerStatus>) => {
      const pending = pendingRequests.current.get(data.requestId);
      if (pending) {
        if (data.success) {
          pending.resolve(data.data);
        } else {
          pending.reject(new Error(data.error || 'Docker status failed'));
        }
        pendingRequests.current.delete(data.requestId);
      }
    };

    const handleLogsResponse = (data: DockerOperationResponse<DockerLogs>) => {
      const pending = pendingRequests.current.get(data.requestId);
      if (pending) {
        if (data.success) {
          pending.resolve(data.data);
        } else {
          pending.reject(new Error(data.error || 'Docker logs failed'));
        }
        pendingRequests.current.delete(data.requestId);
      }
    };

    const handleActionResponse = (data: DockerOperationResponse) => {
      const pending = pendingRequests.current.get(data.requestId);
      if (pending) {
        if (data.success) {
          pending.resolve(undefined);
        } else {
          pending.reject(new Error(data.error || 'Docker action failed'));
        }
        pendingRequests.current.delete(data.requestId);
      }
    };

    socket.on('docker:status:response', handleStatusResponse);
    socket.on('docker:logs:response', handleLogsResponse);
    socket.on('docker:start:response', handleActionResponse);
    socket.on('docker:stop:response', handleActionResponse);
    socket.on('docker:restart:response', handleActionResponse);

    return () => {
      socket.off('docker:status:response', handleStatusResponse);
      socket.off('docker:logs:response', handleLogsResponse);
      socket.off('docker:start:response', handleActionResponse);
      socket.off('docker:stop:response', handleActionResponse);
      socket.off('docker:restart:response', handleActionResponse);
    };
  }, [socket]);

  const getStatus = useCallback(async (): Promise<DockerStatus> => {
    if (!socket || !workspaceId) {
      throw new Error('Not connected');
    }

    const requestId = generateRequestId();
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      socket.emit('docker:status', { requestId, workspaceId });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error('Docker status request timed out'));
        }
      }, 30000);
    });
  }, [socket, workspaceId]);

  const getLogs = useCallback(async (containerId: string, tail?: number): Promise<DockerLogs> => {
    if (!socket || !workspaceId) {
      throw new Error('Not connected');
    }

    const requestId = generateRequestId();
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      socket.emit('docker:logs', { requestId, workspaceId, containerId, tail });

      setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error('Docker logs request timed out'));
        }
      }, 30000);
    });
  }, [socket, workspaceId]);

  const startContainer = useCallback(async (containerId: string): Promise<void> => {
    if (!socket || !workspaceId) {
      throw new Error('Not connected');
    }

    const requestId = generateRequestId();
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      socket.emit('docker:start', { requestId, workspaceId, containerId });

      setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error('Docker start request timed out'));
        }
      }, 30000);
    });
  }, [socket, workspaceId]);

  const stopContainer = useCallback(async (containerId: string): Promise<void> => {
    if (!socket || !workspaceId) {
      throw new Error('Not connected');
    }

    const requestId = generateRequestId();
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      socket.emit('docker:stop', { requestId, workspaceId, containerId });

      setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error('Docker stop request timed out'));
        }
      }, 30000);
    });
  }, [socket, workspaceId]);

  const restartContainer = useCallback(async (containerId: string): Promise<void> => {
    if (!socket || !workspaceId) {
      throw new Error('Not connected');
    }

    const requestId = generateRequestId();
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      socket.emit('docker:restart', { requestId, workspaceId, containerId });

      setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error('Docker restart request timed out'));
        }
      }, 30000);
    });
  }, [socket, workspaceId]);

  return {
    getStatus,
    getLogs,
    startContainer,
    stopContainer,
    restartContainer,
    isConnected,
  };
}
