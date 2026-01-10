'use client';

import { useState, useEffect, useCallback } from 'react';

interface GitHook {
  name: string;
  exists: boolean;
  executable: boolean;
  size: number;
  isSample: boolean;
  inRepo: boolean;
  syncStatus: 'synced' | 'different' | 'local-only' | 'repo-only' | 'none';
}

interface SyncStatus {
  inSync: boolean;
  repoOnly: string[];
  containerOnly: string[];
  different: string[];
  synced: string[];
}

interface GitHooksModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function GitHooksModal({ workspaceId, isOpen, onClose }: GitHooksModalProps) {
  const [hooks, setHooks] = useState<GitHook[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const fetchHooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/git-hooks`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      if (response.ok) {
        const { data } = await response.json();
        setAvailable(data.available);
        setHooks(data.hooks || []);
        setSyncStatus(data.syncStatus || null);
        if (!data.available && data.reason) {
          setError(data.reason);
        }
      } else {
        setError('Failed to fetch git hooks');
      }
    } catch {
      setError('Failed to fetch git hooks');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!isOpen) return;
    fetchHooks();
  }, [workspaceId, isOpen, fetchHooks]);

  const handlePush = async (hookNames?: string[]) => {
    setSyncing(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/git-hooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ hooks: hookNames }),
      });
      if (response.ok) {
        await fetchHooks();
      } else {
        const { error } = await response.json();
        setError(error?.message || 'Failed to push hooks');
      }
    } catch {
      setError('Failed to push hooks');
    } finally {
      setSyncing(false);
    }
  };

  const handlePull = async (hookNames?: string[]) => {
    setSyncing(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/git-hooks`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ hooks: hookNames }),
      });
      if (response.ok) {
        await fetchHooks();
      } else {
        const { error } = await response.json();
        setError(error?.message || 'Failed to pull hooks');
      }
    } catch {
      setError('Failed to pull hooks');
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  const activeHooks = hooks.filter(h => h.exists && h.executable);
  const inactiveHooks = hooks.filter(h => !h.exists || !h.executable);

  const getSyncStatusBadge = (hook: GitHook) => {
    switch (hook.syncStatus) {
      case 'synced':
        return (
          <span className="text-xs px-1.5 py-0.5 rounded bg-success/20 text-success">
            synced
          </span>
        );
      case 'different':
        return (
          <span className="text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning">
            differs
          </span>
        );
      case 'local-only':
        return (
          <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">
            local
          </span>
        );
      case 'repo-only':
        return (
          <span className="text-xs px-1.5 py-0.5 rounded bg-foreground-tertiary/20 text-foreground-tertiary">
            repo
          </span>
        );
      default:
        return null;
    }
  };

  const getSyncActions = (hook: GitHook) => {
    if (!available || syncing) return null;

    switch (hook.syncStatus) {
      case 'local-only':
        return (
          <button
            onClick={() => handlePull([hook.name])}
            className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
            title="Save this hook to repository"
          >
            Save
          </button>
        );
      case 'different':
        return (
          <div className="flex gap-1">
            <button
              onClick={() => handlePush([hook.name])}
              className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
              title="Push repo version to workspace"
            >
              Push
            </button>
            <button
              onClick={() => handlePull([hook.name])}
              className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning hover:bg-warning/30 transition-colors"
              title="Pull workspace version to repository"
            >
              Pull
            </button>
          </div>
        );
      case 'repo-only':
        return (
          <button
            onClick={() => handlePush([hook.name])}
            className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
            title="Push this hook to workspace"
          >
            Push
          </button>
        );
      default:
        return null;
    }
  };

  const hasUnsyncedHooks = syncStatus && !syncStatus.inSync;
  const hasPushableHooks = syncStatus && (syncStatus.repoOnly.length > 0 || syncStatus.different.length > 0);
  const hasPullableHooks = syncStatus && (syncStatus.containerOnly.length > 0 || syncStatus.different.length > 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-background-secondary rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[75vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Git Hooks</h3>
          <button onClick={onClose} className="text-foreground-secondary hover:text-foreground text-xl leading-none">
            &times;
          </button>
        </div>

        {/* Sync Status Bar */}
        {available && syncStatus && (
          <div className="px-4 py-2 border-b border-border bg-background-tertiary/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${syncStatus.inSync ? 'bg-success' : 'bg-warning'}`} />
              <span className="text-sm text-foreground-secondary">
                {syncStatus.inSync ? 'All hooks in sync' : 'Hooks out of sync'}
              </span>
            </div>
            {hasUnsyncedHooks && (
              <div className="flex gap-2">
                {hasPushableHooks && (
                  <button
                    onClick={() => handlePush()}
                    disabled={syncing}
                    className="text-xs px-3 py-1 rounded bg-primary hover:bg-primary/80 text-white disabled:opacity-50 transition-colors"
                  >
                    {syncing ? 'Syncing...' : 'Push All'}
                  </button>
                )}
                {hasPullableHooks && (
                  <button
                    onClick={() => handlePull()}
                    disabled={syncing}
                    className="text-xs px-3 py-1 rounded border border-primary text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
                  >
                    {syncing ? 'Syncing...' : 'Pull All'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-foreground-secondary">Loading...</div>
          ) : error ? (
            <div className="text-center py-8 text-foreground-tertiary italic">{error}</div>
          ) : !available ? (
            <div className="text-center py-8 text-foreground-tertiary italic">
              Git hooks not available
            </div>
          ) : (
            <div className="space-y-4">
              {/* Active hooks */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  Active Hooks ({activeHooks.length})
                </h4>
                {activeHooks.length === 0 ? (
                  <p className="text-sm text-foreground-tertiary italic pl-4">No active hooks</p>
                ) : (
                  <div className="space-y-2">
                    {activeHooks.map((hook) => (
                      <div
                        key={hook.name}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded border bg-success/10 border-success/30"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-success" />
                          <span className="text-sm text-foreground">{hook.name}</span>
                          {getSyncStatusBadge(hook)}
                        </div>
                        {getSyncActions(hook)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Inactive/Available hooks */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-foreground-tertiary" />
                  Available Hooks ({inactiveHooks.length})
                </h4>
                <div className="space-y-2">
                  {inactiveHooks.map((hook) => (
                    <div
                      key={hook.name}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded border ${
                        hook.exists && !hook.executable
                          ? 'bg-warning/10 border-warning/30'
                          : hook.syncStatus === 'repo-only'
                          ? 'bg-primary/5 border-primary/30'
                          : hook.isSample
                          ? 'bg-background-tertiary/50 border-border-secondary'
                          : 'bg-background-tertiary/30 border-border-secondary opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          hook.exists && !hook.executable
                            ? 'bg-warning'
                            : hook.syncStatus === 'repo-only'
                            ? 'bg-primary'
                            : 'bg-foreground-tertiary'
                        }`} />
                        <span className="text-sm text-foreground">{hook.name}</span>
                        {hook.exists && !hook.executable && (
                          <span className="relative group cursor-help">
                            <span className="text-xs text-warning">!</span>
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 text-xs bg-background-secondary border border-border rounded shadow-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-10">
                              Hook exists but is not executable
                            </div>
                          </span>
                        )}
                        {hook.isSample && (
                          <span className="text-xs text-foreground-tertiary">.sample</span>
                        )}
                        {getSyncStatusBadge(hook)}
                      </div>
                      {getSyncActions(hook)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Help text */}
          <p className="mt-4 text-xs text-foreground-tertiary border-t border-border pt-4">
            Git hooks are scripts in <code className="bg-background-tertiary px-1 rounded">.git/hooks/</code> that run automatically on git events.
            Hooks saved to the repository are automatically deployed to new workspaces.
          </p>
        </div>
      </div>
    </div>
  );
}
