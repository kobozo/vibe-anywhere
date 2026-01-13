'use client';

import { useState } from 'react';
import type { UserRole } from '@/lib/db/schema';

interface CreateUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateUserDialog({ isOpen, onClose, onSuccess }: CreateUserDialogProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('developer');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{
    username?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  if (!isOpen) return null;

  const validateUsername = (value: string): string | undefined => {
    if (!value) return 'Username is required';
    if (value.length < 3) return 'Username must be at least 3 characters';
    if (value.length > 32) return 'Username must be at most 32 characters';
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      return 'Username can only contain letters, numbers, hyphens, and underscores';
    }
    return undefined;
  };

  const validatePassword = (value: string): string | undefined => {
    if (!value) return 'Password is required';
    if (value.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(value)) return 'Password must contain at least one lowercase letter';
    if (!/[0-9]/.test(value)) return 'Password must contain at least one number';
    return undefined;
  };

  const validateConfirmPassword = (value: string): string | undefined => {
    if (!value) return 'Please confirm password';
    if (value !== password) return 'Passwords do not match';
    return undefined;
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    const error = validateUsername(value);
    setValidationErrors((prev) => ({ ...prev, username: error }));
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    const error = validatePassword(value);
    setValidationErrors((prev) => ({ ...prev, password: error }));
    // Re-validate confirm password if it's already filled
    if (confirmPassword) {
      const confirmError = value !== confirmPassword ? 'Passwords do not match' : undefined;
      setValidationErrors((prev) => ({ ...prev, confirmPassword: confirmError }));
    }
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    const error = validateConfirmPassword(value);
    setValidationErrors((prev) => ({ ...prev, confirmPassword: error }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate all fields
    const usernameError = validateUsername(username);
    const passwordError = validatePassword(password);
    const confirmPasswordError = validateConfirmPassword(confirmPassword);

    setValidationErrors({
      username: usernameError,
      password: passwordError,
      confirmPassword: confirmPasswordError,
    });

    if (usernameError || passwordError || confirmPasswordError) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ username, password, role }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      // Success
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    // Reset form
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setRole('developer');
    setError(null);
    setValidationErrors({});
    onClose();
  };

  const formatRoleName = (role: UserRole) => {
    const roleMap: Record<UserRole, string> = {
      admin: 'Admin',
      'user-admin': 'User Admin',
      developer: 'Developer',
      'template-admin': 'Template Admin',
      'security-admin': 'Security Admin',
    };
    return roleMap[role] || role;
  };

  const getRoleDescription = (role: UserRole) => {
    const roleDescriptions: Record<UserRole, string> = {
      admin: 'Full system access',
      'user-admin': 'Can manage users',
      developer: 'Default user role',
      'template-admin': 'Can manage templates',
      'security-admin': 'Can manage security settings',
    };
    return roleDescriptions[role] || '';
  };

  const allRoles: UserRole[] = ['admin', 'user-admin', 'developer', 'template-admin', 'security-admin'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Create User</h2>
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
              className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary"
              disabled={isLoading}
              autoFocus
            />
            {validationErrors.username && (
              <p className="text-error text-xs mt-1">{validationErrors.username}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm text-foreground mb-1">
              Password <span className="text-error">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary"
              disabled={isLoading}
            />
            {validationErrors.password && (
              <p className="text-error text-xs mt-1">{validationErrors.password}</p>
            )}
            <p className="text-xs text-foreground-tertiary mt-1">
              Must be 8+ characters with uppercase, lowercase, and number
            </p>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm text-foreground mb-1">
              Confirm Password <span className="text-error">*</span>
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => handleConfirmPasswordChange(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary"
              disabled={isLoading}
            />
            {validationErrors.confirmPassword && (
              <p className="text-error text-xs mt-1">{validationErrors.confirmPassword}</p>
            )}
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm text-foreground mb-1">
              Role <span className="text-error">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground"
              disabled={isLoading}
            >
              {allRoles.map((r) => (
                <option key={r} value={r}>
                  {formatRoleName(r)} - {getRoleDescription(r)}
                </option>
              ))}
            </select>
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
            disabled={isLoading}
          >
            {isLoading ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}
