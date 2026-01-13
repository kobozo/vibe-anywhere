'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useWorkspaceState } from '@/hooks/useWorkspaceState';
import { useAuth } from '@/hooks/useAuth';
import type { Repository, Workspace, ContainerStatus } from '@/lib/db/schema';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SidebarContextMenu } from './sidebar-context-menu';
import { WorkspaceShareModal } from '@/components/workspace/workspace-share-modal';

type SortOption = 'name-asc' | 'name-desc' | 'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc';

interface RepositoryTreeProps {
  onSelectWorkspace: (workspace: Workspace | null, repository: Repository) => void;
  selectedWorkspaceId?: string | null;
  selectedRepositoryId?: string | null;
  onAddRepository: () => void;
  onAddWorkspace: (repositoryId: string) => void;
  onEditRepository: (repository: Repository) => void;
  repositories: Repository[];
  isLoading: boolean;
  error: Error | null;
  onDeleteRepository: (repoId: string) => Promise<void>;
  // When set, refresh workspaces for this repo ID (used after creating a workspace)
  refreshWorkspacesForRepoId?: string | null;
  onWorkspacesRefreshed?: () => void;
  // Called when a workspace is removed (container destroyed or workspace deleted)
  onWorkspaceRemoved?: (workspaceId: string) => void;
  // UI state persistence
  initialExpandedRepos?: string[];
  onExpandedReposChange?: (repoIds: string[]) => void;
  // Callback when workspaces are loaded for a repository
  onWorkspacesLoaded?: (repoId: string, workspaces: Workspace[]) => void;
  // Filter/sort persistence
  initialSearchQuery?: string;
  initialSortOption?: string;
  onSearchQueryChange?: (query: string) => void;
  onSortOptionChange?: (option: string) => void;
}

export function RepositoryTree({
  onSelectWorkspace,
  selectedWorkspaceId,
  selectedRepositoryId,
  onAddRepository,
  onAddWorkspace,
  onEditRepository,
  repositories,
  isLoading,
  error,
  onDeleteRepository,
  refreshWorkspacesForRepoId,
  onWorkspacesRefreshed,
  onWorkspaceRemoved,
  initialExpandedRepos,
  onExpandedReposChange,
  onWorkspacesLoaded,
  initialSearchQuery,
  initialSortOption,
  onSearchQueryChange,
  onSortOptionChange,
}: RepositoryTreeProps) {

  const { user, role } = useAuth();
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(() => new Set(initialExpandedRepos || []));
  const [isInitialized, setIsInitialized] = useState(false);
  const [workspacesByRepo, setWorkspacesByRepo] = useState<Record<string, Workspace[]>>({});
  const [loadingRepos, setLoadingRepos] = useState<Set<string>>(new Set());
  const [redeployingWorkspaces, setRedeployingWorkspaces] = useState<Set<string>>(new Set());
  const [destroyingWorkspaces, setDestroyingWorkspaces] = useState<Set<string>>(new Set());
  const [workspaceToDestroy, setWorkspaceToDestroy] = useState<Workspace | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);
  const [repoToDelete, setRepoToDelete] = useState<Repository | null>(null);
  const [workspaceToShare, setWorkspaceToShare] = useState<Workspace | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    repository?: Repository;
    workspace?: Workspace;
  } | null>(null);
  const [searchQuery, setSearchQueryState] = useState(initialSearchQuery || '');
  const [sortOption, setSortOptionState] = useState<SortOption>((initialSortOption as SortOption) || 'name-asc');
  const [showFilters, setShowFilters] = useState(Boolean(initialSearchQuery));

  // Handlers that persist changes
  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
    onSearchQueryChange?.(query);
  }, [onSearchQueryChange]);

  const setSortOption = useCallback((option: SortOption) => {
    setSortOptionState(option);
    onSortOptionChange?.(option);
  }, [onSortOptionChange]);

  // Filter and sort repositories
  const filteredAndSortedRepos = useMemo(() => {
    let result = [...repositories];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(repo =>
        repo.name.toLowerCase().includes(query) ||
        repo.description?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sortOption) {
        case 'name-asc':
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        case 'name-desc':
          return b.name.toLowerCase().localeCompare(a.name.toLowerCase());
        case 'updated-desc':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'updated-asc':
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        case 'created-desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'created-asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [repositories, searchQuery, sortOption]);

  // Extract all workspace IDs for WebSocket subscription
  const allWorkspaceIds = useMemo(() => {
    return Object.values(workspacesByRepo).flat().map(w => w.id);
  }, [workspacesByRepo]);

  // Handle real-time workspace state updates via WebSocket
  const handleWorkspaceUpdate = useCallback((update: {
    workspaceId: string;
    containerId?: string | null;
    containerStatus?: ContainerStatus;
    containerIp?: string | null;
    agentConnected?: boolean;
    agentVersion?: string | null;
  }) => {
    setWorkspacesByRepo(prev => {
      const updated = { ...prev };
      for (const repoId of Object.keys(updated)) {
        updated[repoId] = updated[repoId].map(ws => {
          if (ws.id !== update.workspaceId) return ws;

          // Create updated workspace with changed fields
          const newWs = { ...ws };
          if (update.containerId !== undefined) newWs.containerId = update.containerId;
          if (update.containerStatus !== undefined) newWs.containerStatus = update.containerStatus;
          if (update.containerIp !== undefined) newWs.containerIp = update.containerIp;
          if (update.agentConnected !== undefined) {
            newWs.agentConnectedAt = update.agentConnected ? Date.now() : null;
          }
          if (update.agentVersion !== undefined) newWs.agentVersion = update.agentVersion;

          return newWs;
        });
      }
      return updated;
    });
  }, []);

  // Subscribe to real-time workspace state updates
  useWorkspaceState({
    workspaceIds: allWorkspaceIds,
    onUpdate: handleWorkspaceUpdate,
  });

  // Update expanded repos from initial props when loaded from localStorage
  useEffect(() => {
    if (initialExpandedRepos && !isInitialized) {
      setExpandedRepos(new Set(initialExpandedRepos));
      setIsInitialized(true);
    }
  }, [initialExpandedRepos, isInitialized]);

  // Auto-fetch workspaces for expanded repos on mount (to restore state after page refresh)
  useEffect(() => {
    if (!isInitialized || repositories.length === 0) return;

    const fetchWorkspacesForExpandedRepos = async () => {
      for (const repoId of expandedRepos) {
        // Skip if already loaded or currently loading
        if (workspacesByRepo[repoId] || loadingRepos.has(repoId)) continue;

        // Verify repo exists in repositories list
        if (!repositories.some(r => r.id === repoId)) continue;

        setLoadingRepos(prev => new Set([...prev, repoId]));
        try {
          const response = await fetch(`/api/repositories/${repoId}/workspaces`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
          });
          if (response.ok) {
            const { data } = await response.json();
            setWorkspacesByRepo(prev => ({ ...prev, [repoId]: data.workspaces }));
            // Notify parent about loaded workspaces
            onWorkspacesLoaded?.(repoId, data.workspaces);
          }
        } finally {
          setLoadingRepos(prev => {
            const next = new Set(prev);
            next.delete(repoId);
            return next;
          });
        }
      }
    };

    fetchWorkspacesForExpandedRepos();
    // Only run on mount (when isInitialized becomes true) and when repositories load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, repositories.length]);

  // Notify parent when expanded repos change (for persistence)
  useEffect(() => {
    if (isInitialized) {
      onExpandedReposChange?.(Array.from(expandedRepos));
    }
  }, [expandedRepos, isInitialized, onExpandedReposChange]);

  // Auto-expand repositories when they have the selected workspace
  useEffect(() => {
    if (selectedWorkspaceId) {
      for (const [repoId, workspaces] of Object.entries(workspacesByRepo)) {
        if (workspaces.some(w => w.id === selectedWorkspaceId)) {
          setExpandedRepos(prev => new Set([...prev, repoId]));
          break;
        }
      }
    }
  }, [selectedWorkspaceId, workspacesByRepo]);

  // Refresh workspaces for a specific repo when triggered from parent
  useEffect(() => {
    if (!refreshWorkspacesForRepoId) return;

    const fetchWorkspacesForRepo = async () => {
      try {
        const response = await fetch(`/api/repositories/${refreshWorkspacesForRepoId}/workspaces`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        });
        if (response.ok) {
          const { data } = await response.json();
          setWorkspacesByRepo(prev => ({ ...prev, [refreshWorkspacesForRepoId]: data.workspaces }));
          // Auto-expand the repo to show the new workspace
          setExpandedRepos(prev => new Set([...prev, refreshWorkspacesForRepoId]));
        }
      } finally {
        onWorkspacesRefreshed?.();
      }
    };

    fetchWorkspacesForRepo();
  }, [refreshWorkspacesForRepoId, onWorkspacesRefreshed]);

  const toggleRepo = useCallback(async (repoId: string) => {
    if (expandedRepos.has(repoId)) {
      setExpandedRepos(prev => {
        const next = new Set(prev);
        next.delete(repoId);
        return next;
      });
    } else {
      setExpandedRepos(prev => new Set([...prev, repoId]));

      // Fetch workspaces if not already loaded
      if (!workspacesByRepo[repoId]) {
        setLoadingRepos(prev => new Set([...prev, repoId]));
        try {
          const response = await fetch(`/api/repositories/${repoId}/workspaces`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
          });
          if (response.ok) {
            const { data } = await response.json();
            setWorkspacesByRepo(prev => ({ ...prev, [repoId]: data.workspaces }));
          }
        } finally {
          setLoadingRepos(prev => {
            const next = new Set(prev);
            next.delete(repoId);
            return next;
          });
        }
      }
    }
  }, [expandedRepos, workspacesByRepo]);

  const handleDeleteRepoClick = (e: React.MouseEvent, repo: Repository) => {
    e.stopPropagation();
    setRepoToDelete(repo);
  };

  const confirmDeleteRepo = async () => {
    if (!repoToDelete) return;
    await onDeleteRepository(repoToDelete.id);
    setRepoToDelete(null);
  };

  const handleDeleteWorkspaceClick = (workspace: Workspace) => {
    setWorkspaceToDelete(workspace);
  };

  const confirmDeleteWorkspace = async () => {
    if (!workspaceToDelete) return;

    const response = await fetch(`/api/workspaces/${workspaceToDelete.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
    });

    if (response.ok) {
      setWorkspacesByRepo(prev => ({
        ...prev,
        [workspaceToDelete.repositoryId]: prev[workspaceToDelete.repositoryId]?.filter(w => w.id !== workspaceToDelete.id) || [],
      }));
      // Notify parent to reset selection if this workspace was selected
      onWorkspaceRemoved?.(workspaceToDelete.id);
    }
    setWorkspaceToDelete(null);
  };

  const getContainerStatusIcon = (workspace: Workspace) => {
    if (redeployingWorkspaces.has(workspace.id) || destroyingWorkspaces.has(workspace.id)) {
      return '🔄';
    }
    switch (workspace.containerStatus) {
      case 'running':
        return '🟢';
      case 'exited':
      case 'dead':
        return '🔴';
      case 'creating':
        return '🟡';
      case 'paused':
        return '🟠';
      default:
        return '⚪';
    }
  };

  const handleRedeployContainer = async (workspace: Workspace) => {
    setRedeployingWorkspaces(prev => new Set([...prev, workspace.id]));
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/redeploy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });

      if (response.ok) {
        // Refresh the workspace list to get updated container status
        const workspacesResponse = await fetch(`/api/repositories/${workspace.repositoryId}/workspaces`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        });
        if (workspacesResponse.ok) {
          const { data } = await workspacesResponse.json();
          setWorkspacesByRepo(prev => ({ ...prev, [workspace.repositoryId]: data.workspaces }));
        }
      } else {
        const { error } = await response.json();
        alert(`Failed to redeploy container: ${error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error redeploying container:', error);
      alert('Failed to redeploy container');
    } finally {
      setRedeployingWorkspaces(prev => {
        const next = new Set(prev);
        next.delete(workspace.id);
        return next;
      });
    }
  };

  const handleDestroyContainerClick = (workspace: Workspace) => {
    setWorkspaceToDestroy(workspace);
  };

  const confirmDestroyContainer = async () => {
    if (!workspaceToDestroy) return;

    const destroyedWorkspaceId = workspaceToDestroy.id;
    setDestroyingWorkspaces(prev => new Set([...prev, destroyedWorkspaceId]));
    setWorkspaceToDestroy(null);

    try {
      const response = await fetch(`/api/workspaces/${destroyedWorkspaceId}/destroy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });

      if (response.ok) {
        // Refresh the workspace list to get updated container status
        const workspacesResponse = await fetch(`/api/repositories/${workspaceToDestroy.repositoryId}/workspaces`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        });
        if (workspacesResponse.ok) {
          const { data } = await workspacesResponse.json();
          setWorkspacesByRepo(prev => ({ ...prev, [workspaceToDestroy.repositoryId]: data.workspaces }));
        }
        // Notify parent to reset selection if this workspace was selected
        onWorkspaceRemoved?.(destroyedWorkspaceId);
      } else {
        const { error } = await response.json();
        alert(`Failed to destroy container: ${error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error destroying container:', error);
      alert('Failed to destroy container');
    } finally {
      setDestroyingWorkspaces(prev => {
        const next = new Set(prev);
        next.delete(destroyedWorkspaceId);
        return next;
      });
    }
  };

  // Context menu handlers
  const handleRepoContextMenu = (e: React.MouseEvent, repo: Repository) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      repository: repo,
    });
  };

  const handleWorkspaceContextMenu = (e: React.MouseEvent, workspace: Workspace) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      workspace: workspace,
    });
  };

  // Workspace action handlers
  const handleStartWorkspace = async (workspace: Workspace) => {
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });

      if (response.ok) {
        // Refresh workspace list
        const workspacesResponse = await fetch(`/api/repositories/${workspace.repositoryId}/workspaces`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        });
        if (workspacesResponse.ok) {
          const { data } = await workspacesResponse.json();
          setWorkspacesByRepo(prev => ({ ...prev, [workspace.repositoryId]: data.workspaces }));
        }
      } else {
        const { error } = await response.json();
        alert(`Failed to start workspace: ${error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error starting workspace:', error);
      alert('Failed to start workspace');
    }
  };

  const handleRestartWorkspace = async (workspace: Workspace) => {
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/restart`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });

      if (response.ok) {
        // Refresh workspace list
        const workspacesResponse = await fetch(`/api/repositories/${workspace.repositoryId}/workspaces`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        });
        if (workspacesResponse.ok) {
          const { data } = await workspacesResponse.json();
          setWorkspacesByRepo(prev => ({ ...prev, [workspace.repositoryId]: data.workspaces }));
        }
      } else {
        const { error } = await response.json();
        alert(`Failed to restart workspace: ${error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error restarting workspace:', error);
      alert('Failed to restart workspace');
    }
  };

  const handleShutdownWorkspace = async (workspace: Workspace) => {
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/shutdown`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });

      if (response.ok) {
        // Refresh workspace list
        const workspacesResponse = await fetch(`/api/repositories/${workspace.repositoryId}/workspaces`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        });
        if (workspacesResponse.ok) {
          const { data } = await workspacesResponse.json();
          setWorkspacesByRepo(prev => ({ ...prev, [workspace.repositoryId]: data.workspaces }));
        }
      } else {
        const { error } = await response.json();
        alert(`Failed to shutdown workspace: ${error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error shutting down workspace:', error);
      alert('Failed to shutdown workspace');
    }
  };

  const handleReloadEnvVars = async (workspace: Workspace) => {
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/env-vars/reload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });

      if (response.ok) {
        // Show success notification - the terminal will show the reload message
        alert(`Environment variables reloaded for workspace: ${workspace.name}\n\nNew terminals will use updated values. Run 'reload-env' in existing shells.`);
      } else {
        const errorData = await response.json();
        console.error('Reload env vars failed:', errorData);
        const message = errorData.error?.message || errorData.error || 'Unknown error';
        const details = errorData.error?.details ? `\n\nDetails: ${JSON.stringify(errorData.error.details, null, 2)}` : '';
        alert(`Failed to reload env vars: ${message}${details}`);
      }
    } catch (error) {
      console.error('Error reloading env vars:', error);
      alert('Failed to reload environment variables');
    }
  };

  const handleShareWorkspaceClick = (workspace: Workspace) => {
    setWorkspaceToShare(workspace);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide">Repositories</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-1.5 rounded transition-colors ${
                showFilters || searchQuery ? 'bg-primary/20 text-primary' : 'text-foreground-secondary hover:text-foreground hover:bg-background-tertiary'
              }`}
              title="Filter & Sort"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
            <button
              onClick={onAddRepository}
              className="px-2 py-1 bg-primary hover:bg-primary-hover rounded text-xs text-primary-foreground transition-colors"
            >
              + Add
            </button>
          </div>
        </div>

        {/* Filter and Sort Controls */}
        {showFilters && (
          <div className="mt-3 space-y-2">
            {/* Search Input */}
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-tertiary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 text-sm bg-background-secondary border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-tertiary hover:text-foreground"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="w-full px-2.5 py-1.5 text-sm bg-background-secondary border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="updated-desc">Recently Updated</option>
              <option value="updated-asc">Oldest Updated</option>
              <option value="created-desc">Recently Created</option>
              <option value="created-asc">Oldest Created</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && repositories.length === 0 && (
          <div className="text-center text-foreground-secondary py-8">Loading repositories...</div>
        )}

        {error && (
          <div className="text-center text-error py-4">
            Failed to load repositories: {error.message}
          </div>
        )}

        {!isLoading && repositories.length === 0 && (
          <div className="text-center text-foreground-secondary py-8">
            <p>No repositories yet.</p>
            <p className="text-sm mt-2">Add a repository to get started.</p>
          </div>
        )}

        {!isLoading && repositories.length > 0 && filteredAndSortedRepos.length === 0 && (
          <div className="text-center text-foreground-secondary py-8">
            <p>No matching repositories.</p>
            <button
              onClick={() => setSearchQuery('')}
              className="text-sm text-primary hover:underline mt-2"
            >
              Clear search
            </button>
          </div>
        )}

        {filteredAndSortedRepos.map((repo) => {
          // Type assertion to access owner metadata
          const repoWithOwner = repo as typeof repo & { ownerUsername?: string };
          const isOwnedByCurrentUser = repo.userId === user?.id;
          const canEdit = isOwnedByCurrentUser || role === 'admin';
          const canDelete = isOwnedByCurrentUser || role === 'admin';

          return (
            <div key={repo.id} className="mb-1">
              {/* Repository header */}
              <div
                onClick={() => {
                  // Select repository to show dashboard
                  onSelectWorkspace(null, repo);
                }}
                onContextMenu={(e) => handleRepoContextMenu(e, repo)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer group
                  hover:bg-background-tertiary/50 ${
                    selectedRepositoryId === repo.id && !selectedWorkspaceId
                      ? 'bg-primary/20 ring-1 ring-primary/30'
                      : expandedRepos.has(repo.id)
                      ? 'bg-background-tertiary/30'
                      : ''
                  }`}
              >
                <span
                  className="text-foreground-secondary text-xs w-4 hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRepo(repo.id);
                  }}
                >
                  {expandedRepos.has(repo.id) ? '▾' : '▸'}
                </span>
                <div className={`flex-1 text-sm truncate ${
                  selectedRepositoryId === repo.id && !selectedWorkspaceId
                    ? 'text-primary'
                    : 'text-foreground'
                }`}>
                  <span>{repo.name}</span>
                  {!isOwnedByCurrentUser && repoWithOwner.ownerUsername && (
                    <span className="text-xs text-foreground-tertiary ml-2">
                      (Owner: {repoWithOwner.ownerUsername})
                    </span>
                  )}
                </div>
                {canEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditRepository(repo);
                    }}
                    className="text-foreground-secondary hover:text-primary px-1 transition-colors"
                    title="Edit repository"
                  >
                    ✎
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={(e) => handleDeleteRepoClick(e, repo)}
                    className="text-foreground-secondary hover:text-error px-1 transition-colors"
                    title="Delete repository"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Workspaces */}
              {expandedRepos.has(repo.id) && (
                <div className="ml-4 border-l border-border">
                {loadingRepos.has(repo.id) ? (
                  <div className="text-foreground-tertiary text-xs py-2 pl-4">Loading...</div>
                ) : (
                  <>
                    {(workspacesByRepo[repo.id] || []).map((workspace) => {
                      // Type assertion to access share metadata
                      const ws = workspace as typeof workspace & {
                        isShared?: boolean;
                        sharedBy?: string;
                        shareCount?: number;
                        sharedWithUsernames?: string[];
                      };

                      return (
                        <div
                          key={workspace.id}
                          onClick={() => onSelectWorkspace(workspace, repo)}
                          onContextMenu={(e) => handleWorkspaceContextMenu(e, workspace)}
                          className={`px-2 py-1.5 ml-2 rounded cursor-pointer group relative
                            hover:bg-background-tertiary/50
                            ${selectedWorkspaceId === workspace.id ? 'bg-primary/20 text-primary' : 'text-foreground'}`}
                        >
                          {/* Main workspace info row */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm" title={`Container: ${workspace.containerStatus || 'unknown'}`}>
                              {getContainerStatusIcon(workspace)}
                            </span>
                            <span className="flex-1 text-sm truncate">{workspace.name}</span>
                            <span className="text-xs text-foreground-tertiary">{workspace.branchName}</span>
                          </div>

                          {/* Share badges */}
                          {ws.isShared && ws.sharedBy && (
                            <div className="ml-6 mt-1">
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs">
                                <span>👤</span>
                                <span>Shared by {ws.sharedBy}</span>
                              </div>
                            </div>
                          )}
                          {!ws.isShared && ws.shareCount !== undefined && ws.shareCount > 0 && (
                            <div className="ml-6 mt-1">
                              <div
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 rounded text-xs cursor-help"
                                title={ws.sharedWithUsernames?.join(', ') || ''}
                              >
                                <span>👥</span>
                                <span>Shared with {ws.shareCount} user{ws.shareCount !== 1 ? 's' : ''}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={() => onAddWorkspace(repo.id)}
                      className="flex items-center gap-2 px-2 py-1.5 ml-2 text-foreground-tertiary hover:text-foreground text-sm"
                    >
                      <span>+</span>
                      <span>New workspace</span>
                    </button>
                  </>
                )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Repository Confirmation */}
      <ConfirmDialog
        isOpen={!!repoToDelete}
        title="Delete Repository"
        message={`Delete repository "${repoToDelete?.name}"? This will remove all workspaces and tabs.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDeleteRepo}
        onCancel={() => setRepoToDelete(null)}
      />

      {/* Delete Workspace Confirmation */}
      <ConfirmDialog
        isOpen={!!workspaceToDelete}
        title="Delete Workspace"
        message={`Delete workspace "${workspaceToDelete?.name}"? This will remove the worktree and all tabs.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDeleteWorkspace}
        onCancel={() => setWorkspaceToDelete(null)}
      />

      {/* Destroy Container Confirmation */}
      <ConfirmDialog
        isOpen={!!workspaceToDestroy}
        title="Destroy Container"
        message={`Destroy container for "${workspaceToDestroy?.name}"? The workspace will remain but you'll need to start a new container.`}
        confirmLabel="Destroy"
        confirmVariant="warning"
        onConfirm={confirmDestroyContainer}
        onCancel={() => setWorkspaceToDestroy(null)}
      />

      {/* Sidebar Context Menu */}
      {contextMenu && (
        <SidebarContextMenu
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          repository={contextMenu.repository}
          onEditRepository={() => {
            if (contextMenu.repository) {
              onEditRepository(contextMenu.repository);
            }
          }}
          onAddWorkspace={() => {
            if (contextMenu.repository) {
              onAddWorkspace(contextMenu.repository.id);
            }
          }}
          onDeleteRepository={() => {
            if (contextMenu.repository) {
              setRepoToDelete(contextMenu.repository);
            }
          }}
          workspace={contextMenu.workspace}
          onStartWorkspace={() => {
            if (contextMenu.workspace) {
              handleStartWorkspace(contextMenu.workspace);
            }
          }}
          onRestartWorkspace={() => {
            if (contextMenu.workspace) {
              handleRestartWorkspace(contextMenu.workspace);
            }
          }}
          onShutdownWorkspace={() => {
            if (contextMenu.workspace) {
              handleShutdownWorkspace(contextMenu.workspace);
            }
          }}
          onRedeployWorkspace={() => {
            if (contextMenu.workspace) {
              handleRedeployContainer(contextMenu.workspace);
            }
          }}
          onDestroyWorkspace={() => {
            if (contextMenu.workspace) {
              handleDestroyContainerClick(contextMenu.workspace);
            }
          }}
          onDeleteWorkspace={() => {
            if (contextMenu.workspace) {
              handleDeleteWorkspaceClick(contextMenu.workspace);
            }
          }}
          onReloadEnvVars={() => {
            if (contextMenu.workspace) {
              handleReloadEnvVars(contextMenu.workspace);
            }
          }}
          onShareWorkspace={() => {
            if (contextMenu.workspace) {
              handleShareWorkspaceClick(contextMenu.workspace);
            }
          }}
          isRedeploying={contextMenu.workspace ? redeployingWorkspaces.has(contextMenu.workspace.id) : false}
          isDestroying={contextMenu.workspace ? destroyingWorkspaces.has(contextMenu.workspace.id) : false}
          isOwner={
            contextMenu.repository
              ? contextMenu.repository.userId === user?.id
              : contextMenu.workspace
              ? (() => {
                  const repo = repositories.find(r => r.id === contextMenu.workspace?.repositoryId);
                  return repo?.userId === user?.id;
                })()
              : false
          }
          isAdmin={role === 'admin'}
        />
      )}

      {/* Workspace Share Modal */}
      {workspaceToShare && (
        <WorkspaceShareModal
          isOpen={!!workspaceToShare}
          onClose={() => setWorkspaceToShare(null)}
          workspace={workspaceToShare}
        />
      )}
    </div>
  );
}
