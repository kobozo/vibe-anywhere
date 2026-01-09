'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'vibe-anywhere-ui-state';

interface UIState {
  expandedRepos: string[];
  selectedTabId: string | null;
  activeGroupId: string | null;
  selectedRepositoryId: string | null;
  selectedWorkspaceId: string | null;
  repoSearchQuery: string;
  repoSortOption: string;
}

const defaultState: UIState = {
  expandedRepos: [],
  selectedTabId: null,
  activeGroupId: null,
  selectedRepositoryId: null,
  selectedWorkspaceId: null,
  repoSearchQuery: '',
  repoSortOption: 'name-asc',
};

function loadState(): UIState {
  if (typeof window === 'undefined') return defaultState;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultState, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('Failed to load UI state from localStorage:', e);
  }
  return defaultState;
}

function saveState(state: UIState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save UI state to localStorage:', e);
  }
}

export function useUIState() {
  const [state, setState] = useState<UIState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    setIsLoaded(true);
  }, []);

  const setExpandedRepos = useCallback((repos: string[]) => {
    setState(prev => {
      const next = { ...prev, expandedRepos: repos };
      saveState(next);
      return next;
    });
  }, []);

  const setSelectedTabId = useCallback((tabId: string | null) => {
    setState(prev => {
      const next = { ...prev, selectedTabId: tabId };
      saveState(next);
      return next;
    });
  }, []);

  const setActiveGroupId = useCallback((groupId: string | null) => {
    setState(prev => {
      const next = { ...prev, activeGroupId: groupId };
      saveState(next);
      return next;
    });
  }, []);

  const setSelectedRepositoryId = useCallback((repoId: string | null) => {
    setState(prev => {
      const next = { ...prev, selectedRepositoryId: repoId };
      saveState(next);
      return next;
    });
  }, []);

  const setSelectedWorkspaceId = useCallback((workspaceId: string | null) => {
    setState(prev => {
      const next = { ...prev, selectedWorkspaceId: workspaceId };
      saveState(next);
      return next;
    });
  }, []);

  const setRepoSearchQuery = useCallback((query: string) => {
    setState(prev => {
      const next = { ...prev, repoSearchQuery: query };
      saveState(next);
      return next;
    });
  }, []);

  const setRepoSortOption = useCallback((option: string) => {
    setState(prev => {
      const next = { ...prev, repoSortOption: option };
      saveState(next);
      return next;
    });
  }, []);

  return {
    expandedRepos: state.expandedRepos,
    selectedTabId: state.selectedTabId,
    activeGroupId: state.activeGroupId,
    selectedRepositoryId: state.selectedRepositoryId,
    selectedWorkspaceId: state.selectedWorkspaceId,
    repoSearchQuery: state.repoSearchQuery,
    repoSortOption: state.repoSortOption,
    isLoaded,
    setExpandedRepos,
    setSelectedTabId,
    setActiveGroupId,
    setSelectedRepositoryId,
    setSelectedWorkspaceId,
    setRepoSearchQuery,
    setRepoSortOption,
  };
}
