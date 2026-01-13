'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks';
import type { UserRole } from '@/lib/db/schema';

interface User {
  id: string;
  username: string;
  role: UserRole;
}

interface ChangeRoleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: User | null;
}

const allRoles: UserRole[] = ['admin', 'user-admin', 'developer', 'template-admin', 'security-admin'];

const formatRoleName = (role: UserRole): string => {
  const roleMap: Record<UserRole, string> = {
    admin: 'Admin',
    'user-admin': 'User Admin',
    developer: 'Developer',
    'template-admin': 'Template Admin',
    'security-admin': 'Security Admin',
  };
  return roleMap[role] || role;
};

const getRoleDescription = (role: UserRole): string => {
  const descriptions: Record<UserRole, string> = {
    admin: 'Full system access, can manage all users and settings',
    'user-admin': 'Can manage users but not system settings',
    developer: 'Can create and manage own workspaces',
    'template-admin': 'Can manage container templates',
    'security-admin': 'Can manage security settings and audit logs',
  };
  return descriptions[role] || '';
};

export function ChangeRoleDialog({ isOpen, onClose, onSuccess, user }: ChangeRoleDialogProps) {
  const { user: currentUser } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if changing own role
  const isOwnAccount = currentUser?.id === user?.id;

  if (!isOpen || !user) return null;

  const currentRole = user.role;
  const roleToChange = selectedRole || currentRole;

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setError(null);

    // If selecting the same role, don't show confirmation
    if (role === currentRole) {
      setShowConfirmation(false);
    } else {
      // Show confirmation for role change
      setShowConfirmation(true);
    }
  };

  const handleConfirmChange = async () => {
    if (!selectedRole || selectedRole === currentRole) {
      setError('No role change to apply');
      return;
    }

    if (isOwnAccount) {
      setError('Cannot change your own role');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to change role');
      }

      // Success
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    // Reset state
    setSelectedRole(null);
    setShowConfirmation(false);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Change User Role</h2>
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-error/20 border border-error/50 rounded text-error text-sm">
              {error}
            </div>
          )}

          {isOwnAccount && (
            <div className="p-3 bg-error/20 border border-error/50 rounded text-error text-sm">
              Cannot change your own role
            </div>
          )}

          <div>
            <p className="text-sm text-foreground mb-2">
              User: <span className="font-medium">{user.username}</span>
            </p>
            <p className="text-sm text-foreground-secondary mb-4">
              Current role: <span className="font-medium">{formatRoleName(currentRole)}</span>
            </p>
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm text-foreground mb-2">
              Select New Role <span className="text-error">*</span>
            </label>
            <div className="space-y-2">
              {allRoles.map((role) => (
                <label
                  key={role}
                  className={`flex items-start p-3 border rounded cursor-pointer transition-colors ${
                    roleToChange === role
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-border-secondary'
                  } ${isOwnAccount ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    checked={roleToChange === role}
                    onChange={() => handleRoleSelect(role)}
                    disabled={isLoading || isOwnAccount}
                    className="mt-0.5 mr-3"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {formatRoleName(role)}
                    </div>
                    <div className="text-xs text-foreground-secondary mt-1">
                      {getRoleDescription(role)}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Confirmation Message */}
          {showConfirmation && selectedRole && selectedRole !== currentRole && !isOwnAccount && (
            <div className="p-3 bg-warning/20 border border-warning/50 rounded text-warning text-sm">
              <p className="font-medium mb-1">Confirm Role Change</p>
              <p>
                Change <span className="font-medium">{user.username}</span> from{' '}
                <span className="font-medium">{formatRoleName(currentRole)}</span> to{' '}
                <span className="font-medium">{formatRoleName(selectedRole)}</span>?
              </p>
              <p className="mt-2 text-xs">
                This will immediately update the user's permissions.
              </p>
            </div>
          )}
        </div>

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
            type="button"
            onClick={handleConfirmChange}
            className="px-4 py-2 text-sm bg-primary hover:bg-primary-hover text-foreground rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || isOwnAccount || !selectedRole || selectedRole === currentRole}
          >
            {isLoading ? 'Changing...' : 'Confirm Change'}
          </button>
        </div>
      </div>
    </div>
  );
}
