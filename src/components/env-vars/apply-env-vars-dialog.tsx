'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Workspace } from '@/lib/db/schema';

interface ApplyEnvVarsDialogProps {
  isOpen: boolean;
  repositoryId: string | null;
  repositoryName: string;
  onClose: () => void;
}

interface WorkspaceApplyState {
  workspace: Workspace;
  selected: boolean;
  loading: boolean;
  success: boolean;
  error: string | null;
}

export function ApplyEnvVarsDialog({
  isOpen,
  repositoryId,
  repositoryName,
  onClose,
}: ApplyEnvVarsDialogProps) {
  const { token } = useAuth();
  const [workspaceStates, setWorkspaceStates] = useState<WorkspaceApplyState[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Fetch workspaces for this repository
  const fetchWorkspaces = useCallback(async () => {
    if (!token || !repositoryId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/repositories/${repositoryId}/workspaces`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch workspaces');
      }

      const { data } = await response.json();

      // Only include running workspaces with containers
      const runningWorkspaces = (data.workspaces || []).filter(
        (ws: Workspace) => ws.containerStatus === 'running'
      );

      setWorkspaceStates(
        runningWorkspaces.map((ws: Workspace) => ({
          workspace: ws,
          selected: true, // Default to all selected
          loading: false,
          success: false,
          error: null,
        }))
      );
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, repositoryId]);

  // Load workspaces when dialog opens
  useEffect(() => {
    if (isOpen && repositoryId) {
      fetchWorkspaces();
    } else {
      // Reset state when dialog closes
      setWorkspaceStates([]);
    }
  }, [isOpen, repositoryId, fetchWorkspaces]);

  // Toggle workspace selection
  const handleToggleWorkspace = useCallback((workspaceId: string) => {
    setWorkspaceStates((prev) =>
      prev.map((ws) =>
        ws.workspace.id === workspaceId ? { ...ws, selected: !ws.selected } : ws
      )
    );
  }, []);

  // Select/deselect all
  const handleSelectAll = useCallback((selected: boolean) => {
    setWorkspaceStates((prev) => prev.map((ws) => ({ ...ws, selected })));
  }, []);

  // Apply env vars to selected workspaces
  const handleApply = useCallback(async () => {
    if (!token) return;

    const selectedWorkspaces = workspaceStates.filter((ws) => ws.selected);
    if (selectedWorkspaces.length === 0) return;

    setIsApplying(true);

    // Apply to each workspace sequentially
    for (const wsState of selectedWorkspaces) {
      const { workspace } = wsState;

      // Mark as loading
      setWorkspaceStates((prev) =>
        prev.map((ws) =>
          ws.workspace.id === workspace.id
            ? { ...ws, loading: true, error: null }
            : ws
        )
      );

      try {
        const response = await fetch(`/api/workspaces/${workspace.id}/env-vars/reload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || 'Failed to reload env vars');
        }

        // Mark as success
        setWorkspaceStates((prev) =>
          prev.map((ws) =>
            ws.workspace.id === workspace.id
              ? { ...ws, loading: false, success: true }
              : ws
          )
        );
      } catch (err) {
        // Mark as error
        setWorkspaceStates((prev) =>
          prev.map((ws) =>
            ws.workspace.id === workspace.id
              ? {
                  ...ws,
                  loading: false,
                  error: err instanceof Error ? err.message : 'Failed to apply',
                }
              : ws
          )
        );
      }
    }

    setIsApplying(false);
  }, [token, workspaceStates]);

  if (!isOpen) return null;

  const selectedCount = workspaceStates.filter((ws) => ws.selected).length;
  const allSelected = workspaceStates.length > 0 && selectedCount === workspaceStates.length;
  const noneSelected = selectedCount === 0;
  const hasCompleted = workspaceStates.some((ws) => ws.success || ws.error);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-lg mx-4 min-h-[80vh] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            Apply Environment Variables to Workspaces
          </h2>
          <p className="text-sm text-foreground-secondary mt-1">
            Repository: {repositoryName}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-foreground-tertiary text-sm py-8 text-center">
              Loading workspaces...
            </div>
          ) : workspaceStates.length === 0 ? (
            <div className="text-foreground-tertiary text-sm py-8 text-center bg-background-tertiary/30 rounded">
              No running workspaces found for this repository.
              <br />
              Environment variables will be applied automatically when workspaces start.
            </div>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-sm text-foreground-secondary mb-3">
                  Select workspaces to reload environment variables. New terminals and tabs will
                  use the updated variables. Existing shells can run{' '}
                  <code className="px-1 py-0.5 bg-background-tertiary rounded text-xs font-mono">
                    reload-env
                  </code>{' '}
                  to apply changes.
                </p>

                {/* Select all checkbox */}
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="select-all"
                    checked={allSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    disabled={isApplying}
                    className="w-4 h-4 rounded border-border-secondary bg-background-tertiary text-primary"
                  />
                  <label htmlFor="select-all" className="text-sm text-foreground cursor-pointer">
                    Select all ({workspaceStates.length})
                  </label>
                </div>
              </div>

              {/* Workspace list */}
              <div className="space-y-2">
                {workspaceStates.map(({ workspace, selected, loading, success, error }) => (
                  <div
                    key={workspace.id}
                    className={`p-3 rounded border transition-colors ${
                      selected
                        ? 'bg-background-tertiary/50 border-border'
                        : 'bg-background-tertiary/20 border-border-secondary'
                    } ${success ? 'border-success/50 bg-success/5' : ''} ${
                      error ? 'border-error/50 bg-error/5' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => handleToggleWorkspace(workspace.id)}
                        disabled={isApplying}
                        className="mt-0.5 w-4 h-4 rounded border-border-secondary bg-background-tertiary text-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">
                            {workspace.name}
                          </span>
                          {workspace.branchName && (
                            <span className="text-xs px-1.5 py-0.5 bg-background-input text-foreground-secondary rounded font-mono">
                              {workspace.branchName}
                            </span>
                          )}
                          {loading && (
                            <span className="text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded">
                              Applying...
                            </span>
                          )}
                          {success && (
                            <span className="text-xs px-1.5 py-0.5 bg-success/20 text-success rounded flex items-center gap-1">
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                              Applied
                            </span>
                          )}
                        </div>
                        {workspace.containerIp && (
                          <div className="text-xs text-foreground-tertiary mt-0.5">
                            {workspace.containerIp}
                          </div>
                        )}
                        {error && (
                          <div className="text-xs text-error mt-1 flex items-start gap-1">
                            <svg
                              className="w-3 h-3 mt-0.5 flex-shrink-0"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span>{error}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-between items-center gap-3">
          <div className="text-sm text-foreground-secondary">
            {hasCompleted ? (
              <span>
                {workspaceStates.filter((ws) => ws.success).length} applied,{' '}
                {workspaceStates.filter((ws) => ws.error).length} failed
              </span>
            ) : (
              <span>{selectedCount} selected</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-foreground hover:text-foreground-secondary transition-colors"
              disabled={isApplying}
            >
              {hasCompleted ? 'Done' : 'Cancel'}
            </button>
            {!hasCompleted && workspaceStates.length > 0 && (
              <button
                type="button"
                onClick={handleApply}
                disabled={isApplying || noneSelected}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApplying ? 'Applying...' : `Apply to ${selectedCount} workspace${selectedCount !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
