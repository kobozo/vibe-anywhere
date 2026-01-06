'use client';

import { useState, useEffect } from 'react';

interface GitHook {
  name: string;
  exists: boolean;
  executable: boolean;
  size: number;
  isSample: boolean;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchHooks = async () => {
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
          if (!data.available && data.reason) {
            setError(data.reason);
          }
        } else {
          setError('Failed to fetch git hooks');
        }
      } catch (err) {
        setError('Failed to fetch git hooks');
      } finally {
        setLoading(false);
      }
    };

    fetchHooks();
  }, [workspaceId, isOpen]);

  if (!isOpen) return null;

  const activeHooks = hooks.filter(h => h.exists && h.executable);
  const inactiveHooks = hooks.filter(h => !h.exists || !h.executable);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-background-secondary rounded-lg shadow-xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Git Hooks</h3>
          <button onClick={onClose} className="text-foreground-secondary hover:text-foreground text-xl leading-none">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
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
                  <div className="grid grid-cols-2 gap-2">
                    {activeHooks.map((hook) => (
                      <div
                        key={hook.name}
                        className="flex items-center gap-2 px-3 py-2 rounded border bg-success/10 border-success/30"
                      >
                        <span className="w-2 h-2 rounded-full bg-success" />
                        <span className="text-sm text-foreground">{hook.name}</span>
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
                <div className="grid grid-cols-2 gap-2">
                  {inactiveHooks.map((hook) => (
                    <div
                      key={hook.name}
                      className={`flex items-center gap-2 px-3 py-2 rounded border ${
                        hook.exists && !hook.executable
                          ? 'bg-warning/10 border-warning/30'
                          : hook.isSample
                          ? 'bg-background-tertiary/50 border-border-secondary'
                          : 'bg-background-tertiary/30 border-border-secondary opacity-60'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${
                        hook.exists && !hook.executable
                          ? 'bg-warning'
                          : 'bg-foreground-tertiary'
                      }`} />
                      <span className="text-sm text-foreground">{hook.name}</span>
                      {hook.exists && !hook.executable && (
                        <span className="text-xs text-warning" title="Hook exists but is not executable">!</span>
                      )}
                      {hook.isSample && (
                        <span className="text-xs text-foreground-tertiary">.sample</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Help text */}
          <p className="mt-4 text-xs text-foreground-tertiary border-t border-border pt-4">
            Git hooks are scripts in <code className="bg-background-tertiary px-1 rounded">.git/hooks/</code> that run automatically on git events.
            Green hooks are active (executable), yellow hooks exist but aren&apos;t executable.
          </p>
        </div>
      </div>
    </div>
  );
}
