'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
                <input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary"
                  disabled={isLoading}
                />
              </div>

              {/* New Password */}
              <div>
                <label htmlFor="newPassword" className="block text-sm text-foreground-secondary mb-1">
                  New Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary"
                  disabled={isLoading}
                />
              </div>

              {/* Confirm New Password */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm text-foreground-secondary mb-1">
                  Confirm New Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary"
                  disabled={isLoading}
                />
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
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
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
