'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useWorkspaceState } from '@/hooks/useWorkspaceState';
import type { Repository, Workspace, ContainerStatus } from '@/lib/db/schema';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { WorkspaceInfoPanel } from '@/components/ui/workspace-info-panel';

interface RepositoryTreeProps {
  onSelectWorkspace: (workspace: Workspace, repository: Repository) => void;
  selectedWorkspaceId?: string | null;
  onAddRepository: () => void;
  onAddWorkspace: (repositoryId: string) => void;
  repositories: Repository[];
  isLoading: boolean;
  error: Error | null;
  onDeleteRepository: (repoId: string) => Promise<void>;
}

export function RepositoryTree({
  onSelectWorkspace,
  selectedWorkspaceId,
  onAddRepository,
  onAddWorkspace,
  repositories,
  isLoading,
  error,
  onDeleteRepository,
}: RepositoryTreeProps) {

  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const [workspacesByRepo, setWorkspacesByRepo] = useState<Record<string, Workspace[]>>({});
  const [loadingRepos, setLoadingRepos] = useState<Set<string>>(new Set());
  const [infoPanelWorkspace, setInfoPanelWorkspace] = useState<Workspace | null>(null);
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

    setDestroyingWorkspaces(prev => new Set([...prev, workspaceToDestroy.id]));
    setWorkspaceToDestroy(null);

    try {
      const response = await fetch(`/api/workspaces/${workspaceToDestroy.id}/destroy`, {
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
        next.delete(workspaceToDestroy.id);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Repositories</h2>
          <button
            onClick={onAddRepository}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && repositories.length === 0 && (
          <div className="text-center text-gray-400 py-8">Loading repositories...</div>
        )}

        {error && (
          <div className="text-center text-red-400 py-4">
            Failed to load repositories: {error.message}
          </div>
        )}

        {!isLoading && repositories.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <p>No repositories yet.</p>
            <p className="text-sm mt-2">Add a repository to get started.</p>
          </div>
        )}

        {repositories.map((repo) => (
          <div key={repo.id} className="mb-1">
            {/* Repository header */}
            <div
              onClick={() => toggleRepo(repo.id)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer group
                hover:bg-gray-700/50 ${expandedRepos.has(repo.id) ? 'bg-gray-700/30' : ''}`}
            >
              <span className="text-gray-400 text-xs w-4">
                {expandedRepos.has(repo.id) ? '▾' : '▸'}
              </span>
              <span className="text-yellow-400 text-sm">📁</span>
              <span className="flex-1 text-sm text-gray-200 truncate">{repo.name}</span>
              <span className="text-xs text-gray-500">
                {repo.sourceType === 'cloned' ? '🔗' : '📂'}
              </span>
              <button
                onClick={(e) => handleDeleteRepoClick(e, repo)}
                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 px-1"
                title="Delete repository"
              >
                ×
              </button>
            </div>

            {/* Workspaces */}
            {expandedRepos.has(repo.id) && (
              <div className="ml-4 border-l border-gray-700">
                {loadingRepos.has(repo.id) ? (
                  <div className="text-gray-500 text-xs py-2 pl-4">Loading...</div>
                ) : (
                  <>
                    {(workspacesByRepo[repo.id] || []).map((workspace) => (
                      <div
                        key={workspace.id}
                        onClick={() => onSelectWorkspace(workspace, repo)}
                        className={`flex items-center gap-2 px-2 py-1.5 ml-2 rounded cursor-pointer group relative
                          hover:bg-gray-700/50
                          ${selectedWorkspaceId === workspace.id ? 'bg-blue-600/20 text-blue-400' : 'text-gray-300'}`}
                      >
                        <span className="text-sm" title={`Container: ${workspace.containerStatus || 'unknown'}`}>
                          {getContainerStatusIcon(workspace)}
                        </span>
                        <span className="flex-1 text-sm truncate">{workspace.name}</span>
                        <span className="text-xs text-gray-500">{workspace.branchName}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInfoPanelWorkspace(workspace);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white px-1"
                          title="Workspace info"
                        >
                          ⓘ
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => onAddWorkspace(repo.id)}
                      className="flex items-center gap-2 px-2 py-1.5 ml-2 text-gray-500 hover:text-gray-300 text-sm"
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

      {/* Workspace Info Panel */}
      {infoPanelWorkspace && (
        <WorkspaceInfoPanel
          workspace={infoPanelWorkspace}
          onClose={() => setInfoPanelWorkspace(null)}
          onRestart={() => handleRestartContainer(infoPanelWorkspace)}
          onDestroy={() => handleDestroyContainerClick(infoPanelWorkspace)}
          onDelete={() => handleDeleteWorkspaceClick(infoPanelWorkspace)}
        />
      )}
    </div>
  );
}
