'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks';

interface User {
  id: string;
  username: string;
}

interface ResetPasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: User | null;
}

export function ResetPasswordDialog({ isOpen, onClose, onSuccess, user }: ResetPasswordDialogProps) {
  const { user: currentUser } = useAuth();
  const [resetOption, setResetOption] = useState<'force-change' | 'set-password'>('force-change');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{
    password?: string;
    confirmPassword?: string;
  }>({});

  // Check if resetting own password
  const isOwnAccount = currentUser?.id === user?.id;

  if (!isOpen || !user) return null;

  const validatePassword = (value: string): string | undefined => {
    if (resetOption === 'force-change') return undefined; // No validation needed for force-change

    if (!value) return 'Password is required';
    if (value.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(value)) return 'Password must contain at least one lowercase letter';
    if (!/[0-9]/.test(value)) return 'Password must contain at least one number';
    return undefined;
  };

  const validateConfirmPassword = (value: string): string | undefined => {
    if (resetOption === 'force-change') return undefined; // No validation needed for force-change

    if (!value) return 'Please confirm the password';
    if (value !== newPassword) return 'Passwords do not match';
    return undefined;
  };

  const handlePasswordChange = (value: string) => {
    setNewPassword(value);
    const error = validatePassword(value);
    setValidationErrors((prev) => ({ ...prev, password: error }));
    
    // Re-validate confirm password if it has a value
    if (confirmPassword) {
      const confirmError = validateConfirmPassword(confirmPassword);
      setValidationErrors((prev) => ({ ...prev, confirmPassword: confirmError }));
    }
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    const error = validateConfirmPassword(value);
    setValidationErrors((prev) => ({ ...prev, confirmPassword: error }));
  };

  const handleResetOptionChange = (option: 'force-change' | 'set-password') => {
    setResetOption(option);
    setError(null);
    setValidationErrors({});
    
    // Clear password fields when switching back to force-change
    if (option === 'force-change') {
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isOwnAccount) {
      setError('Cannot reset your own password');
      return;
    }

    // Validate password fields if set-password option is selected
    if (resetOption === 'set-password') {
      const passwordError = validatePassword(newPassword);
      const confirmError = validateConfirmPassword(confirmPassword);

      setValidationErrors({
        password: passwordError,
        confirmPassword: confirmError,
      });

      if (passwordError || confirmError) {
        return;
      }
    }

    setIsLoading(true);

    try {
      const body = resetOption === 'set-password' ? { newPassword } : {};

      const response = await fetch(`/api/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      // Success
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    // Reset form
    setResetOption('force-change');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setValidationErrors({});
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Reset Password</h2>
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
              Cannot reset your own password. Use the change password feature instead.
            </div>
          )}

          <div>
            <p className="text-sm text-foreground mb-4">
              User: <span className="font-medium">{user.username}</span>
            </p>
          </div>

          {/* Reset Options */}
          <div>
            <label className="block text-sm text-foreground mb-2">
              Select Reset Option <span className="text-error">*</span>
            </label>
            <div className="space-y-2">
              {/* Option 1: Force password change on next login */}
              <label
                className={`flex items-start p-3 border rounded cursor-pointer transition-colors ${
                  resetOption === 'force-change'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-border-secondary'
                } ${isOwnAccount ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="radio"
                  name="resetOption"
                  value="force-change"
                  checked={resetOption === 'force-change'}
                  onChange={() => handleResetOptionChange('force-change')}
                  disabled={isLoading || isOwnAccount}
                  className="mt-0.5 mr-3"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    Force password change on next login
                  </div>
                  <div className="text-xs text-foreground-secondary mt-1">
                    User will be prompted to create a new password when they log in. No password needs to be provided.
                  </div>
                </div>
              </label>

              {/* Option 2: Set temporary password */}
              <label
                className={`flex items-start p-3 border rounded cursor-pointer transition-colors ${
                  resetOption === 'set-password'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-border-secondary'
                } ${isOwnAccount ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="radio"
                  name="resetOption"
                  value="set-password"
                  checked={resetOption === 'set-password'}
                  onChange={() => handleResetOptionChange('set-password')}
                  disabled={isLoading || isOwnAccount}
                  className="mt-0.5 mr-3"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    Set temporary password
                  </div>
                  <div className="text-xs text-foreground-secondary mt-1">
                    Provide a new password for the user. They will be required to change it on next login.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Password fields (only shown for set-password option) */}
          {resetOption === 'set-password' && (
            <>
              <div>
                <label className="block text-sm text-foreground mb-1">
                  New Password <span className="text-error">*</span>
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading || isOwnAccount}
                  autoFocus
                />
                {validationErrors.password && (
                  <p className="text-error text-xs mt-1">{validationErrors.password}</p>
                )}
                <p className="text-xs text-foreground-tertiary mt-1">
                  At least 8 characters with uppercase, lowercase, and number
                </p>
              </div>

              <div>
                <label className="block text-sm text-foreground mb-1">
                  Confirm Password <span className="text-error">*</span>
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => handleConfirmPasswordChange(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading || isOwnAccount}
                />
                {validationErrors.confirmPassword && (
                  <p className="text-error text-xs mt-1">{validationErrors.confirmPassword}</p>
                )}
              </div>
            </>
          )}

          <div className="p-3 bg-background-tertiary border border-border rounded text-xs text-foreground-secondary">
            <p className="font-medium mb-1">Note:</p>
            <p>
              The user will be required to change their password on the next login regardless of which option you choose.
            </p>
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
            className="px-4 py-2 text-sm bg-warning hover:bg-warning-hover text-foreground rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || isOwnAccount}
          >
            {isLoading ? 'Resetting...' : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
