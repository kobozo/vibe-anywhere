'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface ForcePasswordChangeModalProps {
  isOpen: boolean;
}

// Password strength calculation
function calculatePasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!password) return { score: 0, label: '', color: '' };

  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;

  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', 'text-error', 'text-warning', 'text-primary', 'text-success'];

  return {
    score,
    label: labels[score],
    color: colors[score],
  };
}

// Password validation criteria
function getPasswordCriteria(password: string) {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };
}

export function ForcePasswordChangeModal({ isOpen }: ForcePasswordChangeModalProps) {
  const { user, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen || !user) return null;

  // Compute validation state
  const criteria = getPasswordCriteria(newPassword);
  const isPasswordValid = criteria.length && criteria.uppercase && criteria.lowercase && criteria.number;
  const isConfirmValid = newPassword === confirmPassword && confirmPassword.length > 0;
  const isFormValid = currentPassword.length > 0 && isPasswordValid && isConfirmValid;
  const passwordStrength = calculatePasswordStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      setSuccess('Password changed successfully! Redirecting...');
      // Modal will be hidden by parent when forcePasswordChange becomes false
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-md overflow-hidden flex flex-col">
        {/* Header - NO close button */}
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Password Change Required</h2>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Explanation */}
          <p className="text-sm text-foreground-secondary mb-6">
            For security reasons, you must change your password before continuing.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username (read-only display) */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Username
              </label>
              <div className="px-3 py-2 bg-background border border-border rounded text-sm text-foreground-secondary">
                {user.username}
              </div>
            </div>

            {/* Current Password */}
            <div>
              <label htmlFor="current-password" className="block text-sm font-medium text-foreground mb-1">
                Current Password
              </label>
              <div className="relative">
                <input
                  id="current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary text-foreground disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  disabled={isLoading}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-foreground-secondary hover:text-foreground text-sm disabled:opacity-50"
                >
                  {showCurrentPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-foreground mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary text-foreground disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  disabled={isLoading}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-foreground-secondary hover:text-foreground text-sm disabled:opacity-50"
                >
                  {showNewPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {newPassword && (
                <div className="mt-2 text-sm">
                  <span className="text-foreground-secondary">Strength: </span>
                  <span className={passwordStrength.color}>{passwordStrength.label}</span>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-foreground mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary text-foreground disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isLoading}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-foreground-secondary hover:text-foreground text-sm disabled:opacity-50"
                >
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              {/* Password Match Validation */}
              {confirmPassword && (
                <div className="mt-2 text-sm">
                  {isConfirmValid ? (
                    <span className="text-success">Passwords match</span>
                  ) : (
                    <span className="text-error">Passwords do not match</span>
                  )}
                </div>
              )}
            </div>

            {/* Validation Checklist */}
            <div className="bg-background border border-border rounded p-3">
              <p className="text-xs font-medium text-foreground mb-2">Password Requirements:</p>
              <div className="space-y-1 text-xs">
                <div className={criteria.length ? 'text-success' : 'text-foreground-secondary'}>
                  {criteria.length ? '✓' : '○'} At least 8 characters
                </div>
                <div className={criteria.uppercase ? 'text-success' : 'text-foreground-secondary'}>
                  {criteria.uppercase ? '✓' : '○'} Contains uppercase (A-Z)
                </div>
                <div className={criteria.lowercase ? 'text-success' : 'text-foreground-secondary'}>
                  {criteria.lowercase ? '✓' : '○'} Contains lowercase (a-z)
                </div>
                <div className={criteria.number ? 'text-success' : 'text-foreground-secondary'}>
                  {criteria.number ? '✓' : '○'} Contains number (0-9)
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-error/10 border border-error rounded p-3 text-sm text-error">
                {error}
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="bg-success/10 border border-success rounded p-3 text-sm text-success">
                {success}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!isFormValid || isLoading}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isLoading ? 'Changing Password...' : 'Change Password and Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
