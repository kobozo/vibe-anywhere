'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useWorkspaceState } from '@/hooks/useWorkspaceState';
import type { Repository, Workspace, ContainerStatus } from '@/lib/db/schema';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

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
}: RepositoryTreeProps) {

  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(() => new Set(initialExpandedRepos || []));
  const [isInitialized, setIsInitialized] = useState(false);
  const [workspacesByRepo, setWorkspacesByRepo] = useState<Record<string, Workspace[]>>({});
  const [loadingRepos, setLoadingRepos] = useState<Set<string>>(new Set());
  const [restartingWorkspaces, setRestartingWorkspaces] = useState<Set<string>>(new Set());
  const [destroyingWorkspaces, setDestroyingWorkspaces] = useState<Set<string>>(new Set());
  const [workspaceToDestroy, setWorkspaceToDestroy] = useState<Workspace | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);
  const [repoToDelete, setRepoToDelete] = useState<Repository | null>(null);

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
            newWs.agentConnectedAt = update.agentConnected ? new Date() : null;
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
    if (restartingWorkspaces.has(workspace.id) || destroyingWorkspaces.has(workspace.id)) {
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

  const handleRestartContainer = async (workspace: Workspace) => {
    setRestartingWorkspaces(prev => new Set([...prev, workspace.id]));
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/restart`, {
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
        alert(`Failed to restart container: ${error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error restarting container:', error);
      alert('Failed to restart container');
    } finally {
      setRestartingWorkspaces(prev => {
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

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Repositories</h2>
          <button
            onClick={onAddRepository}
            className="px-3 py-1.5 bg-primary hover:bg-primary-hover rounded text-sm text-primary-foreground transition-colors"
          >
            + Add
          </button>
        </div>
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

        {repositories.map((repo) => (
          <div key={repo.id} className="mb-1">
            {/* Repository header */}
            <div
              onClick={() => {
                // Select repository to show dashboard
                onSelectWorkspace(null, repo);
              }}
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
              <span className="text-warning text-sm">📁</span>
              <span className={`flex-1 text-sm truncate ${
                selectedRepositoryId === repo.id && !selectedWorkspaceId
                  ? 'text-primary'
                  : 'text-foreground'
              }`}>{repo.name}</span>
              <span className="text-xs text-foreground-tertiary" title={repo.cloneUrl}>
                🔗
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditRepository(repo);
                }}
                className="opacity-0 group-hover:opacity-100 text-foreground-tertiary hover:text-primary px-1"
                title="Edit repository"
              >
                ✎
              </button>
              <button
                onClick={(e) => handleDeleteRepoClick(e, repo)}
                className="opacity-0 group-hover:opacity-100 text-foreground-tertiary hover:text-error px-1"
                title="Delete repository"
              >
                ×
              </button>
            </div>

            {/* Workspaces */}
            {expandedRepos.has(repo.id) && (
              <div className="ml-4 border-l border-border">
                {loadingRepos.has(repo.id) ? (
                  <div className="text-foreground-tertiary text-xs py-2 pl-4">Loading...</div>
                ) : (
                  <>
                    {(workspacesByRepo[repo.id] || []).map((workspace) => (
                      <div
                        key={workspace.id}
                        onClick={() => onSelectWorkspace(workspace, repo)}
                        className={`flex items-center gap-2 px-2 py-1.5 ml-2 rounded cursor-pointer group relative
                          hover:bg-background-tertiary/50
                          ${selectedWorkspaceId === workspace.id ? 'bg-primary/20 text-primary' : 'text-foreground'}`}
                      >
                        <span className="text-sm" title={`Container: ${workspace.containerStatus || 'unknown'}`}>
                          {getContainerStatusIcon(workspace)}
                        </span>
                        <span className="flex-1 text-sm truncate">{workspace.name}</span>
                        <span className="text-xs text-foreground-tertiary">{workspace.branchName}</span>
                      </div>
                    ))}
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
        ))}
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
    </div>
  );
}
