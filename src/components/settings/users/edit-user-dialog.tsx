'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks';

interface User {
  id: string;
  username: string;
}

interface EditUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: User | null;
}

export function EditUserDialog({ isOpen, onClose, onSuccess, user }: EditUserDialogProps) {
  const { user: currentUser } = useAuth();
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | undefined>(undefined);

  // Check if editing own account
  const isOwnAccount = currentUser?.id === user?.id;

  // Update username when user prop changes
  useEffect(() => {
    if (user) {
      setUsername(user.username);
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const validateUsername = (value: string): string | undefined => {
    if (!value) return 'Username is required';
    if (value.length < 3) return 'Username must be at least 3 characters';
    if (value.length > 32) return 'Username must be at most 32 characters';
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      return 'Username can only contain letters, numbers, hyphens, and underscores';
    }
    return undefined;
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    const error = validateUsername(value);
    setValidationError(error);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate username
    const usernameError = validateUsername(username);
    setValidationError(usernameError);

    if (usernameError) {
      return;
    }

    // Check if username actually changed
    if (username === user.username) {
      setError('No changes to save');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ username }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      // Success
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    // Reset form
    setUsername(user?.username || '');
    setError(null);
    setValidationError(undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Edit User</h2>
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
            <div className="p-3 bg-warning/20 border border-warning/50 rounded text-warning text-sm">
              You cannot edit your own username
            </div>
          )}

          {/* Username */}
          <div>
            <label className="block text-sm text-foreground mb-1">
              Username <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder="john.doe"
              className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || isOwnAccount}
              autoFocus={!isOwnAccount}
            />
            {validationError && (
              <p className="text-error text-xs mt-1">{validationError}</p>
            )}
          </div>

          <div className="text-xs text-foreground-tertiary">
            Only the username can be changed. Use the Reset Password button to change the user's password.
          </div>
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
          <button
            type="submit"
            onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-primary hover:bg-primary-hover text-foreground rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || isOwnAccount}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
