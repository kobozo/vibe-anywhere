'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';

interface RepositoryBranchUpdate {
  repositoryId: string;
  branches: string[];
  defaultBranch: string | null;
  cachedAt: string;
}

interface BranchesMeta {
  cachedAt: string | null;
  isStale: boolean;
}

interface UseRepositoryBranchesOptions {
  repositoryId: string | null;
  onBranchesUpdated?: (branches: string[]) => void;
}

interface UseRepositoryBranchesReturn {
  branches: string[];
  defaultBranch: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  cacheInfo: BranchesMeta;
  refreshBranches: () => Promise<void>;
}

export function useRepositoryBranches(
  options: UseRepositoryBranchesOptions
): UseRepositoryBranchesReturn {
  const { repositoryId, onBranchesUpdated } = options;
  const { token } = useAuth();
  const { socket } = useSocket({ token });

  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<BranchesMeta>({
    cachedAt: null,
    isStale: true,
  });

  // Track callback ref to avoid stale closures
  const onBranchesUpdatedRef = useRef(onBranchesUpdated);
  useEffect(() => {
    onBranchesUpdatedRef.current = onBranchesUpdated;
  }, [onBranchesUpdated]);

  // Track previous repositoryId to detect changes
  const prevRepositoryIdRef = useRef<string | null>(null);

  // Fetch branches from API
  const fetchBranches = useCallback(async () => {
    if (!repositoryId || !token) return;

    try {
      const response = await fetch(`/api/repositories/${repositoryId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch repository');
      }

      const data = await response.json();
      if (data.success && data.data) {
        setBranches(data.data.branches || []);
        setDefaultBranch(data.data.repository?.defaultBranch || null);
        setCacheInfo({
          cachedAt: data.data.branchesMeta?.cachedAt || null,
          isStale: data.data.branchesMeta?.isStale ?? true,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch branches');
    } finally {
      setIsLoading(false);
    }
  }, [repositoryId, token]);

  // Trigger background refresh
  const refreshBranches = useCallback(async () => {
    if (!repositoryId || !token || isRefreshing) return;

    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/repositories/${repositoryId}/branches/refresh`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to refresh branches');
      }

      // Response is immediate (202), actual update comes via WebSocket
      // Keep isRefreshing true until we get the WebSocket update
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh branches');
      setIsRefreshing(false);
    }
  }, [repositoryId, token, isRefreshing]);

  // Subscribe to WebSocket updates
  useEffect(() => {
    if (!socket || !repositoryId) return;

    const handleBranchUpdate = (update: RepositoryBranchUpdate) => {
      if (update.repositoryId !== repositoryId) return;

      console.log('[useRepositoryBranches] Received branch update:', update);

      // Update state with new branches
      setBranches(update.branches);
      setDefaultBranch(update.defaultBranch);
      setCacheInfo({
        cachedAt: update.cachedAt,
        isStale: false,
      });
      setIsRefreshing(false);
      setError(null);

      // Call callback if provided
      onBranchesUpdatedRef.current?.(update.branches);
    };

    socket.on('repository:branches-updated', handleBranchUpdate);

    return () => {
      socket.off('repository:branches-updated', handleBranchUpdate);
    };
  }, [socket, repositoryId]);

  // Fetch on mount and when repositoryId changes
  useEffect(() => {
    // Clear state when switching to a different repository (not just when becoming null)
    const repoChanged = prevRepositoryIdRef.current !== null &&
                        prevRepositoryIdRef.current !== repositoryId;

    if (repoChanged) {
      setBranches([]);
      setDefaultBranch(null);
      setCacheInfo({ cachedAt: null, isStale: true });
      setError(null);
    }

    prevRepositoryIdRef.current = repositoryId;

    if (repositoryId) {
      setIsLoading(true);
      fetchBranches();
    } else {
      // Reset state when no repository selected
      setBranches([]);
      setDefaultBranch(null);
      setIsLoading(false);
      setCacheInfo({ cachedAt: null, isStale: true });
    }
  }, [repositoryId, fetchBranches]);

  // Auto-refresh if cache is stale (after initial fetch)
  useEffect(() => {
    if (!isLoading && cacheInfo.isStale && repositoryId && !isRefreshing) {
      refreshBranches();
    }
  }, [isLoading, cacheInfo.isStale, repositoryId, isRefreshing, refreshBranches]);

  return {
    branches,
    defaultBranch,
    isLoading,
    isRefreshing,
    error,
    cacheInfo,
    refreshBranches,
  };
}
