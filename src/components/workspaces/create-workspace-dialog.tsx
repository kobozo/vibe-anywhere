'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRepositoryBranches } from '@/hooks/useRepositoryBranches';

interface CreateWorkspaceDialogProps {
  isOpen: boolean;
  repositoryId: string | null;
  initialBranch?: string | null; // Pre-select this branch as "use existing"
  onClose: () => void;
  onCreate: (name: string, branchName: string, baseBranch?: string) => Promise<void>;
  isLoading: boolean;
}

export function CreateWorkspaceDialog({
  isOpen,
  repositoryId,
  initialBranch,
  onClose,
  onCreate,
  isLoading,
}: CreateWorkspaceDialogProps) {
  const [name, setName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [branchType, setBranchType] = useState<'new' | 'existing'>('new');
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Handle branch updates from WebSocket without closing dropdown
  const handleBranchesUpdated = useCallback((newBranches: string[]) => {
    // Preserve selection if still valid, otherwise select first branch
    setBaseBranch((current) => {
      if (current && newBranches.includes(current)) {
        return current;
      }
      // Try to select default branch or first available
      if (newBranches.includes('main')) return 'main';
      if (newBranches.includes('master')) return 'master';
      return newBranches[0] || '';
    });
  }, []);

  // Use the new hook for fetching branches with WebSocket updates
  const {
    branches,
    isLoading: branchesLoading,
    isRefreshing,
  } = useRepositoryBranches({
    repositoryId: isOpen ? repositoryId : null,
    onBranchesUpdated: handleBranchesUpdated,
  });

  // Initialize state when dialog opens
  useEffect(() => {
    if (isOpen && !initialized) {
      // If initialBranch provided, use "existing" mode with that branch
      if (initialBranch) {
        setBranchType('existing');
        setBaseBranch(initialBranch);
      } else {
        setBranchType('new');
      }
      setInitialized(true);
    }
    // Reset initialized flag when dialog closes
    if (!isOpen) {
      setInitialized(false);
      setName('');
      setBranchName('');
      setBaseBranch('');
      setError(null);
    }
  }, [isOpen, initialBranch, initialized]);

  // Set initial baseBranch when branches first load (only if no initialBranch)
  useEffect(() => {
    if (branches.length > 0 && !baseBranch && !initialBranch) {
      setBaseBranch(branches.includes('main') ? 'main' : branches[0]);
    }
  }, [branches, baseBranch, initialBranch]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const finalBranchName = branchType === 'new' ? branchName : baseBranch;
      await onCreate(
        name,
        finalBranchName,
        branchType === 'new' ? baseBranch : undefined
      );

      // Reset form
      setName('');
      setBranchName('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    }
  };

  // Auto-generate branch name from workspace name
  const handleNameChange = (value: string) => {
    setName(value);
    if (branchType === 'new' && !branchName) {
      const safeBranchName = value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-');
      setBranchName(`feature/${safeBranchName}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-md">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Create Workspace</h2>
          <button
            onClick={onClose}
            className="text-foreground-secondary hover:text-foreground"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-error/20 border border-error/50 rounded text-error text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-foreground mb-1">
              Workspace Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="My Feature"
              required
              className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary"
            />
          </div>

          <div>
            <label className="block text-sm text-foreground mb-2">Branch</label>
            <div className="flex gap-4 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={branchType === 'new'}
                  onChange={() => setBranchType('new')}
                  className="text-primary"
                />
                <span className="text-sm text-foreground">Create new branch</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={branchType === 'existing'}
                  onChange={() => setBranchType('existing')}
                  className="text-primary"
                />
                <span className="text-sm text-foreground">Use existing branch</span>
              </label>
            </div>

            {branchType === 'new' ? (
              <>
                <input
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="feature/my-feature"
                  required
                  className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary mb-3"
                />
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-sm text-foreground-secondary">Base Branch</label>
                  {isRefreshing && (
                    <span className="text-xs text-foreground-tertiary animate-pulse">
                      Refreshing...
                    </span>
                  )}
                </div>
                <select
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  disabled={branchesLoading}
                  className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground disabled:opacity-50"
                >
                  {branchesLoading && branches.length === 0 ? (
                    <option value="">Loading branches...</option>
                  ) : branches.length === 0 ? (
                    <option value="">No branches available</option>
                  ) : (
                    branches.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))
                  )}
                </select>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-sm text-foreground-secondary sr-only">Select Branch</label>
                  {isRefreshing && (
                    <span className="text-xs text-foreground-tertiary animate-pulse">
                      Refreshing...
                    </span>
                  )}
                </div>
                <select
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  disabled={branchesLoading}
                  className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground disabled:opacity-50"
                >
                  {branchesLoading && branches.length === 0 ? (
                    <option value="">Loading branches...</option>
                  ) : branches.length === 0 ? (
                    <option value="">No branches available</option>
                  ) : (
                    branches.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))
                  )}
                </select>
              </>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-foreground-secondary hover:text-foreground transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !name || (branchType === 'new' ? !branchName : !baseBranch)}
            className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 disabled:cursor-not-allowed rounded text-foreground transition-colors"
          >
            {isLoading ? 'Creating...' : 'Create Workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
