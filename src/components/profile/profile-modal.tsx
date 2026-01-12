'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
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

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
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

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setSuccess('');
    }
  }, [isOpen]);

  if (!isOpen || !user) return null;

  // Compute validation state
  const criteria = getPasswordCriteria(newPassword);
  const isPasswordValid = criteria.length && criteria.uppercase && criteria.lowercase && criteria.number;
  const isConfirmValid = newPassword === confirmPassword && confirmPassword.length > 0;
  const isFormValid = currentPassword.length > 0 && isPasswordValid && isConfirmValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      setSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Auto-close modal after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
  };

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

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-background-secondary rounded-lg w-full max-w-md overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Profile</h2>
          <button
            onClick={onClose}
            className="text-foreground-secondary hover:text-foreground text-xl"
          >
            &times;
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto max-h-[70vh]">
          {/* Profile Information Section */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-foreground mb-3">Account Information</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-foreground-secondary">Username:</span>
                <span className="text-foreground font-medium">{user.username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-secondary">Account created:</span>
                <span className="text-foreground">{new Date(user.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-secondary">Last updated:</span>
                <span className="text-foreground">{new Date(user.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Change Password Section */}
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">Change Password</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Error Message */}
              {error && (
                <div className="p-3 bg-error/10 border border-error/20 rounded text-error text-sm">
                  {error}
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="p-3 bg-success/10 border border-success/20 rounded text-success text-sm">
                  {success}
                </div>
              )}

              {/* Current Password */}
              <div>
                <label htmlFor="currentPassword" className="block text-sm text-foreground-secondary mb-1">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    id="currentPassword"
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 pr-10 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-tertiary hover:text-foreground"
                    disabled={isLoading}
                  >
                    {showCurrentPassword ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label htmlFor="newPassword" className="block text-sm text-foreground-secondary mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-3 py-2 pr-10 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-tertiary hover:text-foreground"
                    disabled={isLoading}
                  >
                    {showNewPassword ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {newPassword && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-foreground-secondary">Strength:</span>
                      <span className={`text-xs font-medium ${calculatePasswordStrength(newPassword).color}`}>
                        {calculatePasswordStrength(newPassword).label}
                      </span>
                    </div>
                    <div className="text-xs space-y-0.5">
                      {Object.entries({
                        'At least 8 characters': getPasswordCriteria(newPassword).length,
                        'Contains uppercase letter (A-Z)': getPasswordCriteria(newPassword).uppercase,
                        'Contains lowercase letter (a-z)': getPasswordCriteria(newPassword).lowercase,
                        'Contains number (0-9)': getPasswordCriteria(newPassword).number,
                      }).map(([label, met]) => (
                        <div key={label} className="flex items-center gap-1">
                          {met ? (
                            <svg className="w-3 h-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3 text-foreground-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                          <span className={met ? 'text-foreground' : 'text-foreground-secondary'}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm New Password */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm text-foreground-secondary mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 pr-10 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-tertiary hover:text-foreground"
                    disabled={isLoading}
                  >
                    {showConfirmPassword ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Password Match Validation */}
                {confirmPassword && (
                  <div className="mt-1">
                    {newPassword === confirmPassword ? (
                      <div className="flex items-center gap-1 text-xs text-success">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Passwords match</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-error">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span>Passwords do not match</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Form Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 text-sm border border-border rounded hover:bg-background-tertiary/50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !isFormValid}
                  className="flex-1 px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Changing Password...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
