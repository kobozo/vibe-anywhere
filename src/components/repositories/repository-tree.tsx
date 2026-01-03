'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRepositories, useWorkspaces } from '@/hooks/useRepositories';
import type { Repository, Workspace } from '@/lib/db/schema';

interface RepositoryTreeProps {
  onSelectWorkspace: (workspace: Workspace, repository: Repository) => void;
  selectedWorkspaceId?: string | null;
  onAddRepository: () => void;
  onAddWorkspace: (repositoryId: string) => void;
}

interface WorkspaceMenuProps {
  workspace: Workspace;
  onClose: () => void;
  onRestart: () => void;
  onDelete: () => void;
}

function WorkspaceMenu({ workspace, onClose, onRestart, onDelete }: WorkspaceMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 min-w-[160px]"
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRestart();
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
      >
        <span>🔄</span> Restart Container
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
      >
        <span>🗑️</span> Delete Workspace
      </button>
    </div>
  );
}

export function RepositoryTree({
  onSelectWorkspace,
  selectedWorkspaceId,
  onAddRepository,
  onAddWorkspace,
}: RepositoryTreeProps) {
  const {
    repositories,
    isLoading,
    error,
    fetchRepositories,
    deleteRepository,
  } = useRepositories();

  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const [workspacesByRepo, setWorkspacesByRepo] = useState<Record<string, Workspace[]>>({});
  const [loadingRepos, setLoadingRepos] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [restartingWorkspaces, setRestartingWorkspaces] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchRepositories();
  }, [fetchRepositories]);

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

  const handleDeleteRepo = async (e: React.MouseEvent, repo: Repository) => {
    e.stopPropagation();
    if (!confirm(`Delete repository "${repo.name}"? This will remove all workspaces and tabs.`)) {
      return;
    }
    await deleteRepository(repo.id);
  };

  const handleDeleteWorkspace = async (workspace: Workspace) => {
    if (!confirm(`Delete workspace "${workspace.name}"? This will remove the worktree and all tabs.`)) {
      return;
    }

    const response = await fetch(`/api/workspaces/${workspace.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
    });

    if (response.ok) {
      setWorkspacesByRepo(prev => ({
        ...prev,
        [workspace.repositoryId]: prev[workspace.repositoryId]?.filter(w => w.id !== workspace.id) || [],
      }));
    }
  };

  const getContainerStatusIcon = (workspace: Workspace) => {
    if (restartingWorkspaces.has(workspace.id)) {
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
                onClick={(e) => handleDeleteRepo(e, repo)}
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
                            setOpenMenuId(openMenuId === workspace.id ? null : workspace.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white px-1"
                          title="Workspace options"
                        >
                          ⋮
                        </button>
                        {openMenuId === workspace.id && (
                          <WorkspaceMenu
                            workspace={workspace}
                            onClose={() => setOpenMenuId(null)}
                            onRestart={() => handleRestartContainer(workspace)}
                            onDelete={() => handleDeleteWorkspace(workspace)}
                          />
                        )}
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
    </div>
  );
}
