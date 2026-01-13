'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks';

interface User {
  id: string;
  username: string;
}

interface ResourceCount {
  repositories: number;
  workspaces: number;
}

interface DeleteUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: User | null;
  resourceCount: ResourceCount;
}

export function DeleteUserDialog({
  isOpen,
  onClose,
  onSuccess,
  user,
  resourceCount,
}: DeleteUserDialogProps) {
  const { user: currentUser } = useAuth();
  const [action, setAction] = useState<'deactivate' | 'delete'>('deactivate');
  const [confirmUsername, setConfirmUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  // Check if deleting own account
  const isOwnAccount = currentUser?.id === user.id;

  // Check if user has resources
  const hasResources = resourceCount.repositories > 0 || resourceCount.workspaces > 0;
  const totalResources = resourceCount.repositories + resourceCount.workspaces;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Prevent self-deletion
    if (isOwnAccount) {
      setError('Cannot delete your own account');
      return;
    }

    // Check resources for hard delete
    if (hasResources && action === 'delete') {
      setError(
        `Cannot delete ${user.username} - owns ${resourceCount.repositories} ${
          resourceCount.repositories === 1 ? 'repository' : 'repositories'
        } and ${resourceCount.workspaces} ${resourceCount.workspaces === 1 ? 'workspace' : 'workspaces'}`
      );
      return;
    }

    // Validate confirmation for hard delete
    if (action === 'delete' && confirmUsername !== user.username) {
      setError('Username confirmation does not match');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${action} user`);
      }

      // Success
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} user`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    // Reset form
    setAction('deactivate');
    setConfirmUsername('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              {hasResources ? 'Cannot Delete User' : 'Delete User'}
            </h2>
            <button
              onClick={handleClose}
              className="text-foreground-secondary hover:text-foreground"
              disabled={isLoading}
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-error/20 border border-error/50 rounded text-error text-sm">
              {error}
            </div>
          )}

          {isOwnAccount && (
            <div className="p-3 bg-error/20 border border-error/50 rounded text-error text-sm">
              Cannot delete your own account
            </div>
          )}

          {hasResources ? (
            // User has resources - cannot delete
            <div>
              <div className="p-3 bg-error/20 border border-error/50 rounded text-error text-sm mb-4">
                Cannot delete <strong>{user.username}</strong> - owns {resourceCount.repositories}{' '}
                {resourceCount.repositories === 1 ? 'repository' : 'repositories'} and{' '}
                {resourceCount.workspaces}{' '}
                {resourceCount.workspaces === 1 ? 'workspace' : 'workspaces'}
              </div>
              <p className="text-sm text-foreground-secondary">
                This user cannot be deleted because they own {totalResources}{' '}
                {totalResources === 1 ? 'resource' : 'resources'}. Please reassign or delete their
                resources first.
              </p>
            </div>
          ) : (
            // User has no resources - show options
            <>
              <p className="text-sm text-foreground-secondary">
                Choose how to remove user <strong className="text-foreground">{user.username}</strong>
              </p>

              {/* Action Options */}
              <div className="space-y-3">
                {/* Deactivate Option */}
                <label
                  className={`flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors ${
                    action === 'deactivate'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-border-secondary'
                  }`}
                >
                  <input
                    type="radio"
                    name="action"
                    value="deactivate"
                    checked={action === 'deactivate'}
                    onChange={() => setAction('deactivate')}
                    className="mt-0.5"
                    disabled={isLoading || isOwnAccount}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">
                      Deactivate (Recommended)
                    </div>
                    <div className="text-xs text-foreground-secondary mt-1">
                      Soft delete. User cannot log in but their data is preserved. Can be restored
                      later.
                    </div>
                  </div>
                </label>

                {/* Permanently Delete Option */}
                <label
                  className={`flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors ${
                    action === 'delete'
                      ? 'border-error bg-error/10'
                      : 'border-border hover:border-border-secondary'
                  }`}
                >
                  <input
                    type="radio"
                    name="action"
                    value="delete"
                    checked={action === 'delete'}
                    onChange={() => setAction('delete')}
                    className="mt-0.5"
                    disabled={isLoading || isOwnAccount}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-error">Permanently Delete</div>
                    <div className="text-xs text-foreground-secondary mt-1">
                      Hard delete. User and all their data will be permanently removed. This action
                      cannot be undone.
                    </div>
                  </div>
                </label>
              </div>

              {/* Confirmation for hard delete */}
              {action === 'delete' && (
                <div className="p-3 bg-error/10 border border-error/30 rounded">
                  <p className="text-sm text-error font-medium mb-2">⚠️ Warning: Permanent Deletion</p>
                  <p className="text-xs text-foreground-secondary mb-3">
                    This will permanently delete the user. Type the username{' '}
                    <strong className="text-foreground">{user.username}</strong> to confirm:
                  </p>
                  <input
                    type="text"
                    value={confirmUsername}
                    onChange={(e) => setConfirmUsername(e.target.value)}
                    placeholder={user.username}
                    className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary"
                    disabled={isLoading || isOwnAccount}
                  />
                </div>
              )}
            </>
          )}
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-foreground-secondary hover:text-foreground rounded hover:bg-background-tertiary transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          {!hasResources && (
            <button
              type="submit"
              onClick={handleSubmit}
              className={`px-4 py-2 text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                action === 'delete'
                  ? 'bg-error hover:bg-error-hover text-white'
                  : 'bg-warning hover:bg-warning-hover text-black'
              }`}
              disabled={isLoading || isOwnAccount}
            >
              {isLoading
                ? action === 'delete'
                  ? 'Deleting...'
                  : 'Deactivating...'
                : action === 'delete'
                  ? 'Permanently Delete'
                  : 'Deactivate User'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
