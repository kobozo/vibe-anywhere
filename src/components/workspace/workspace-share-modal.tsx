'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Workspace } from '@/lib/db/schema';
import type { WorkspaceShare } from '@/lib/db/schema';

interface WorkspaceWithOwner extends Workspace {
  owner?: {
    id: string;
    username: string;
  };
}

interface WorkspaceShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: WorkspaceWithOwner | null;
}

interface ShareWithUser extends WorkspaceShare {
  sharedWithUser?: {
    username: string;
  };
}

export function WorkspaceShareModal({
  isOpen,
  onClose,
  workspace,
}: WorkspaceShareModalProps) {
  const { user, role } = useAuth();
  const [shares, setShares] = useState<ShareWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Add share form state
  const [username, setUsername] = useState('');
  const [viewPermission, setViewPermission] = useState(true);
  const [executePermission, setExecutePermission] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch shares - wrapped in useCallback to prevent stale closures
  const fetchShares = useCallback(async () => {
    if (!workspace) return;

    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/shares`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch shares');
      }

      const data = await response.json();
      setShares(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shares');
    } finally {
      setIsLoading(false);
    }
  }, [workspace]);

  // Fetch shares when modal opens
  useEffect(() => {
    if (isOpen && workspace) {
      fetchShares();
    }
  }, [isOpen, workspace, fetchShares]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setUsername('');
      setViewPermission(true);
      setExecutePermission(false);
      setError('');
      setSuccess('');
      setShares([]);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !workspace || !user) return null;

  // Check if user is owner or admin
  const isOwner = workspace.owner?.id === user.id;
  const isAdmin = role === 'admin';

  if (!isOwner && !isAdmin) {
    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={onClose}
      >
        <div
          className="bg-background-secondary rounded-lg w-full max-w-md p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            <p className="text-error mb-4">You don't have permission to manage workspace sharing.</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleAddShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      // Build permissions array
      const permissions: string[] = [];
      if (viewPermission) permissions.push('view');
      if (executePermission) permissions.push('execute');

      if (permissions.length === 0) {
        throw new Error('At least one permission must be selected');
      }

      const response = await fetch(`/api/workspaces/${workspace.id}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({
          sharedWithUsername: username,
          permissions,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to share workspace');
      }

      setSuccess(`Workspace shared with ${username}`);
      setUsername('');
      setViewPermission(true);
      setExecutePermission(false);

      // Refresh shares list
      await fetchShares();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveShare = async (shareId: string, sharedWithUserId: string) => {
    setError('');
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/share/${sharedWithUserId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove share');
      }

      // Refresh shares list
      await fetchShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove share');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-background-secondary rounded-lg w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Share Workspace</h2>
            <p className="text-sm text-foreground-secondary">{workspace.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-foreground-secondary hover:text-foreground text-xl"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded text-error text-sm">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-3 bg-success/10 border border-success/20 rounded text-success text-sm">
              {success}
            </div>
          )}

          {/* Add Share Form */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-foreground mb-3">Share with User</h3>
            <form onSubmit={handleAddShare} className="space-y-3">
              {/* Username Input */}
              <div>
                <label htmlFor="username" className="block text-sm text-foreground-secondary mb-1">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder="Enter username"
                  className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary"
                  disabled={isSubmitting}
                />
              </div>

              {/* Permissions Checkboxes */}
              <div>
                <label className="block text-sm text-foreground-secondary mb-2">
                  Permissions
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={viewPermission}
                      onChange={(e) => setViewPermission(e.target.checked)}
                      disabled={isSubmitting}
                      className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary focus:ring-offset-0"
                    />
                    <span className="text-sm text-foreground">
                      <span className="font-medium">View sessions</span>
                      <span className="text-foreground-secondary ml-2">- Can see workspace and terminals</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={executePermission}
                      onChange={(e) => setExecutePermission(e.target.checked)}
                      disabled={isSubmitting}
                      className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary focus:ring-offset-0"
                    />
                    <span className="text-sm text-foreground">
                      <span className="font-medium">Execute commands</span>
                      <span className="text-foreground-secondary ml-2">- Can run commands in terminals</span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || !username.trim()}
                className="w-full px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isSubmitting ? 'Sharing...' : 'Share Workspace'}
              </button>
            </form>
          </div>

          {/* Current Shares List */}
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">Current Shares</h3>
            {isLoading ? (
              <div className="text-center py-4 text-foreground-secondary text-sm">
                Loading shares...
              </div>
            ) : shares.length === 0 ? (
              <div className="text-center py-4 text-foreground-secondary text-sm">
                No shares yet. Share this workspace with other users to collaborate.
              </div>
            ) : (
              <div className="space-y-2">
                {shares.map((share) => {
                  const permissions = share.permissions as string[];
                  const hasView = permissions.includes('view');
                  const hasExecute = permissions.includes('execute');

                  return (
                    <div
                      key={share.id}
                      className="flex items-center justify-between p-3 bg-background-tertiary/50 rounded border border-border"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium text-foreground">
                          {share.sharedWithUser?.username || 'Unknown User'}
                        </div>
                        <div className="text-xs text-foreground-secondary mt-1">
                          {hasView && <span className="mr-2">• View</span>}
                          {hasExecute && <span>• Execute</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveShare(share.id, share.sharedWithUserId)}
                        className="px-3 py-1 text-sm bg-error/20 text-error hover:bg-error/30 rounded transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-foreground-secondary hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
