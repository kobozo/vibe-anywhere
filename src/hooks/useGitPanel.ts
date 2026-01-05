'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAgentGit } from './useAgentGit';
import type { GitStatus, GitDiff, CommitResult, FileChange } from '@/types/git';

interface UseGitPanelOptions {
  workspaceId: string | null;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseGitPanelReturn {
  // State
  status: GitStatus | null;
  selectedFile: string | null;
  selectedFileDiff: string | null;
  isLoading: boolean;
  isStaging: boolean;
  isCommitting: boolean;
  isDiscarding: boolean;
  error: string | null;
  lastRefresh: Date | null;

  // Actions
  refresh: () => Promise<void>;
  selectFile: (path: string | null) => void;
  stageFiles: (files: string[]) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageFiles: (files: string[]) => Promise<void>;
  unstageAll: () => Promise<void>;
  discardFiles: (files: string[]) => Promise<void>;
  discardAll: () => Promise<void>;
  commit: (message: string) => Promise<CommitResult | null>;
  clearError: () => void;
}

export function useGitPanel({
  workspaceId,
  autoRefresh = true,
  refreshInterval = 10000,
}: UseGitPanelOptions): UseGitPanelReturn {
  const { getStatus, getDiff, stage, unstage, commit: agentCommit, discard, isConnected } = useAgentGit({ workspaceId });

  // State
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileDiff, setSelectedFileDiff] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
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
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to get git status');
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [workspaceId, isConnected, getStatus]);

  // Initial fetch when workspace changes
  useEffect(() => {
    if (workspaceId && isConnected) {
      refresh();
    } else {
      setStatus(null);
      setSelectedFile(null);
      setSelectedFileDiff(null);
    }
  }, [workspaceId, isConnected, refresh]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh || !workspaceId || !isConnected) {
      return;
    }

    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, workspaceId, isConnected, refresh]);

  // Fetch diff when file is selected
  const selectFile = useCallback(async (path: string | null) => {
    setSelectedFile(path);
    setSelectedFileDiff(null);

    if (!path || !workspaceId || !isConnected) {
      return;
    }

    try {
      // Determine if file is staged or unstaged
      const isStaged = status?.staged.some(f => f.path === path) ?? false;
      const diff = await getDiff({ staged: isStaged, files: [path] });

      if (mountedRef.current) {
        // Extract the content for the selected file
        const fileDiff = diff.files.find(f => f.path === path);
        setSelectedFileDiff(fileDiff?.content || null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to get diff');
      }
    }
  }, [workspaceId, isConnected, getDiff, status]);

  // Stage files
  const stageFiles = useCallback(async (files: string[]) => {
    if (!workspaceId || !isConnected || files.length === 0) {
      return;
    }

    setIsStaging(true);
    setError(null);

    try {
      await stage(files);
      // Refresh status after staging
      await refresh();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to stage files');
      }
    } finally {
      if (mountedRef.current) {
        setIsStaging(false);
      }
    }
  }, [workspaceId, isConnected, stage, refresh]);

  // Stage all files
  const stageAll = useCallback(async () => {
    if (!workspaceId || !isConnected) {
      return;
    }

    setIsStaging(true);
    setError(null);

    try {
      await stage([]);
      await refresh();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to stage all files');
      }
    } finally {
      if (mountedRef.current) {
        setIsStaging(false);
      }
    }
  }, [workspaceId, isConnected, stage, refresh]);

  // Unstage files
  const unstageFiles = useCallback(async (files: string[]) => {
    if (!workspaceId || !isConnected || files.length === 0) {
      return;
    }

    setIsStaging(true);
    setError(null);

    try {
      await unstage(files);
      await refresh();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to unstage files');
      }
    } finally {
      if (mountedRef.current) {
        setIsStaging(false);
      }
    }
  }, [workspaceId, isConnected, unstage, refresh]);

  // Unstage all files
  const unstageAll = useCallback(async () => {
    if (!workspaceId || !isConnected) {
      return;
    }

    setIsStaging(true);
    setError(null);

    try {
      await unstage([]);
      await refresh();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to unstage all files');
      }
    } finally {
      if (mountedRef.current) {
        setIsStaging(false);
      }
    }
  }, [workspaceId, isConnected, unstage, refresh]);

  // Discard changes to files
  const discardFiles = useCallback(async (files: string[]) => {
    if (!workspaceId || !isConnected || files.length === 0) {
      return;
    }

    setIsDiscarding(true);
    setError(null);

    try {
      await discard(files);
      // Clear selection if discarded file was selected
      if (selectedFile && files.includes(selectedFile)) {
        setSelectedFile(null);
        setSelectedFileDiff(null);
      }
      await refresh();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to discard changes');
      }
    } finally {
      if (mountedRef.current) {
        setIsDiscarding(false);
      }
    }
  }, [workspaceId, isConnected, discard, refresh, selectedFile]);

  // Discard all changes
  const discardAll = useCallback(async () => {
    if (!workspaceId || !isConnected) {
      return;
    }

    setIsDiscarding(true);
    setError(null);

    try {
      await discard([]);
      setSelectedFile(null);
      setSelectedFileDiff(null);
      await refresh();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to discard all changes');
      }
    } finally {
      if (mountedRef.current) {
        setIsDiscarding(false);
      }
    }
  }, [workspaceId, isConnected, discard, refresh]);

  // Commit changes
  const commit = useCallback(async (message: string): Promise<CommitResult | null> => {
    if (!workspaceId || !isConnected || !message.trim()) {
      return null;
    }

    setIsCommitting(true);
    setError(null);

    try {
      const result = await agentCommit(message);
      await refresh();
      return result;
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to commit');
      }
      return null;
    } finally {
      if (mountedRef.current) {
        setIsCommitting(false);
      }
    }
  }, [workspaceId, isConnected, agentCommit, refresh]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    status,
    selectedFile,
    selectedFileDiff,
    isLoading,
    isStaging,
    isCommitting,
    isDiscarding,
    error,
    lastRefresh,
    refresh,
    selectFile,
    stageFiles,
    stageAll,
    unstageFiles,
    unstageAll,
    discardFiles,
    discardAll,
    commit,
    clearError,
  };
}
