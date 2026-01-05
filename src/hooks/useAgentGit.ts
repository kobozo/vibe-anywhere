'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSocket } from './useSocket';
import type { GitStatus, GitDiff, CommitResult, GitOperationResponse } from '@/types/git';

interface UseAgentGitOptions {
  workspaceId: string | null;
}

interface UseAgentGitReturn {
  getStatus: () => Promise<GitStatus>;
  getDiff: (options?: { staged?: boolean; files?: string[] }) => Promise<GitDiff>;
  stage: (files: string[]) => Promise<void>;
  unstage: (files: string[]) => Promise<void>;
  commit: (message: string) => Promise<CommitResult>;
  discard: (files: string[]) => Promise<void>;
  isConnected: boolean;
}

// Generate unique request IDs
function generateRequestId(): string {
  return `git-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useAgentGit({ workspaceId }: UseAgentGitOptions): UseAgentGitReturn {
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

    const handleStatusResponse = (data: GitOperationResponse<GitStatus>) => {
      const pending = pendingRequests.current.get(data.requestId);
      if (pending) {
        if (data.success) {
          pending.resolve(data.data);
        } else {
          pending.reject(new Error(data.error || 'Git status failed'));
        }
        pendingRequests.current.delete(data.requestId);
      }
    };

    const handleDiffResponse = (data: GitOperationResponse<GitDiff>) => {
      const pending = pendingRequests.current.get(data.requestId);
      if (pending) {
        if (data.success) {
          pending.resolve(data.data);
        } else {
          pending.reject(new Error(data.error || 'Git diff failed'));
        }
        pendingRequests.current.delete(data.requestId);
      }
    };

    const handleStageResponse = (data: GitOperationResponse) => {
      const pending = pendingRequests.current.get(data.requestId);
      if (pending) {
        if (data.success) {
          pending.resolve(undefined);
        } else {
          pending.reject(new Error(data.error || 'Git stage failed'));
        }
        pendingRequests.current.delete(data.requestId);
      }
    };

    const handleUnstageResponse = (data: GitOperationResponse) => {
      const pending = pendingRequests.current.get(data.requestId);
      if (pending) {
        if (data.success) {
          pending.resolve(undefined);
        } else {
          pending.reject(new Error(data.error || 'Git unstage failed'));
        }
        pendingRequests.current.delete(data.requestId);
      }
    };

    const handleCommitResponse = (data: GitOperationResponse<CommitResult>) => {
      const pending = pendingRequests.current.get(data.requestId);
      if (pending) {
        if (data.success) {
          pending.resolve(data.data);
        } else {
          pending.reject(new Error(data.error || 'Git commit failed'));
        }
        pendingRequests.current.delete(data.requestId);
      }
    };

    const handleDiscardResponse = (data: GitOperationResponse) => {
      const pending = pendingRequests.current.get(data.requestId);
      if (pending) {
        if (data.success) {
          pending.resolve(undefined);
        } else {
          pending.reject(new Error(data.error || 'Git discard failed'));
        }
        pendingRequests.current.delete(data.requestId);
      }
    };

    socket.on('git:status:response', handleStatusResponse);
    socket.on('git:diff:response', handleDiffResponse);
    socket.on('git:stage:response', handleStageResponse);
    socket.on('git:unstage:response', handleUnstageResponse);
    socket.on('git:commit:response', handleCommitResponse);
    socket.on('git:discard:response', handleDiscardResponse);

    return () => {
      socket.off('git:status:response', handleStatusResponse);
      socket.off('git:diff:response', handleDiffResponse);
      socket.off('git:stage:response', handleStageResponse);
      socket.off('git:unstage:response', handleUnstageResponse);
      socket.off('git:commit:response', handleCommitResponse);
      socket.off('git:discard:response', handleDiscardResponse);
    };
  }, [socket]);

  const getStatus = useCallback(async (): Promise<GitStatus> => {
    if (!socket || !workspaceId) {
      throw new Error('Not connected');
    }

    const requestId = generateRequestId();
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      socket.emit('git:status', { requestId, workspaceId });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error('Git status request timed out'));
        }
      }, 30000);
    });
  }, [socket, workspaceId]);

  const getDiff = useCallback(async (options?: { staged?: boolean; files?: string[] }): Promise<GitDiff> => {
    if (!socket || !workspaceId) {
      throw new Error('Not connected');
    }

    const requestId = generateRequestId();
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      socket.emit('git:diff', { requestId, workspaceId, ...options });

      setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error('Git diff request timed out'));
        }
      }, 30000);
    });
  }, [socket, workspaceId]);

  const stage = useCallback(async (files: string[]): Promise<void> => {
    if (!socket || !workspaceId) {
      throw new Error('Not connected');
    }

    const requestId = generateRequestId();
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      socket.emit('git:stage', { requestId, workspaceId, files });

      setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error('Git stage request timed out'));
        }
      }, 30000);
    });
  }, [socket, workspaceId]);

  const unstage = useCallback(async (files: string[]): Promise<void> => {
    if (!socket || !workspaceId) {
      throw new Error('Not connected');
    }

    const requestId = generateRequestId();
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      socket.emit('git:unstage', { requestId, workspaceId, files });

      setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error('Git unstage request timed out'));
        }
      }, 30000);
    });
  }, [socket, workspaceId]);

  const commit = useCallback(async (message: string): Promise<CommitResult> => {
    if (!socket || !workspaceId) {
      throw new Error('Not connected');
    }

    const requestId = generateRequestId();
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      socket.emit('git:commit', { requestId, workspaceId, message });

      setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error('Git commit request timed out'));
        }
      }, 30000);
    });
  }, [socket, workspaceId]);

  const discard = useCallback(async (files: string[]): Promise<void> => {
    if (!socket || !workspaceId) {
      throw new Error('Not connected');
    }

    const requestId = generateRequestId();
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      socket.emit('git:discard', { requestId, workspaceId, files });

      setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error('Git discard request timed out'));
        }
      }, 30000);
    });
  }, [socket, workspaceId]);

  return {
    getStatus,
    getDiff,
    stage,
    unstage,
    commit,
    discard,
    isConnected,
  };
}
