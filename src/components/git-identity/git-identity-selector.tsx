'use client';

import React, { useState } from 'react';
import type { GitIdentityInfo } from '@/hooks/useGitIdentities';
import { useAuth } from '@/hooks/useAuth';

export type GitIdentityMode = 'saved' | 'custom';

export interface GitIdentityValue {
  mode: GitIdentityMode;
  identityId?: string;
  customName?: string;
  customEmail?: string;
}

interface GitIdentitySelectorProps {
  value: GitIdentityValue;
  onChange: (value: GitIdentityValue) => void;
  identities: GitIdentityInfo[];
  disabled?: boolean;
  className?: string;
  onIdentityCreated?: (identity: GitIdentityInfo) => void;
}

/**
 * GitIdentitySelector - A component for selecting or entering git identity
 *
 * Features:
 * - Radio toggle between saved identity, custom, or none
 * - Dropdown of saved identities with default badge
 * - Custom name/email inputs
 * - Validation for email format
 */
export function GitIdentitySelector({
  value,
  onChange,
  identities,
  disabled = false,
  className = '',
  onIdentityCreated,
}: GitIdentitySelectorProps) {
  const { token } = useAuth();

  // Inline add identity form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newIdentityName, setNewIdentityName] = useState('');
  const [newGitName, setNewGitName] = useState('');
  const [newGitEmail, setNewGitEmail] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const defaultIdentity = identities.find((i) => i.isDefault) || identities[0];

  const handleModeChange = (mode: GitIdentityMode) => {
    if (mode === 'saved') {
      // Auto-select the default identity
      onChange({
        mode: 'saved',
        identityId: defaultIdentity?.id || '',
        customName: undefined,
        customEmail: undefined,
      });
    } else {
      onChange({
        mode: 'custom',
        identityId: undefined,
        customName: value.customName || '',
        customEmail: value.customEmail || '',
      });
    }
  };

  const handleIdentityChange = (identityId: string) => {
    onChange({
      ...value,
      identityId,
    });
  };

  const handleCustomNameChange = (customName: string) => {
    onChange({
      ...value,
      customName,
    });
  };

  const handleCustomEmailChange = (customEmail: string) => {
    onChange({
      ...value,
      customEmail,
    });
  };

  const resetAddForm = () => {
    setShowAddForm(false);
    setNewIdentityName('');
    setNewGitName('');
    setNewGitEmail('');
    setCreateError(null);
  };

  const handleCreateIdentity = async () => {
    // Validate
    if (!newIdentityName.trim()) {
      setCreateError('Display name is required');
      return;
    }
    if (!newGitName.trim()) {
      setCreateError('Git name is required');
      return;
    }
    if (!newGitEmail.trim() || !newGitEmail.includes('@')) {
      setCreateError('Valid email is required');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const response = await fetch('/api/git-identities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: newIdentityName.trim(),
          gitName: newGitName.trim(),
          gitEmail: newGitEmail.trim(),
          isDefault: identities.length === 0,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create identity');
      }

      const newIdentity = await response.json();

      // Notify parent to refresh identities list
      if (onIdentityCreated) {
        onIdentityCreated(newIdentity);
      }

      // Auto-select the new identity
      onChange({
        mode: 'saved',
        identityId: newIdentity.id,
        customName: undefined,
        customEmail: undefined,
      });

      resetAddForm();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create identity');
    } finally {
      setIsCreating(false);
    }
  };

  // Get the currently selected identity for display
  const selectedIdentity = value.identityId
    ? identities.find((i) => i.id === value.identityId)
    : defaultIdentity;

  // Determine effective mode - treat 'none' as 'saved' for backwards compatibility
  const effectiveMode = value.mode === 'custom' ? 'custom' : 'saved';

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Mode Selection */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleModeChange('saved')}
          disabled={disabled}
          className={`
            px-3 py-1.5 rounded text-sm transition-colors
            ${effectiveMode === 'saved'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background-tertiary text-foreground-secondary hover:text-foreground'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          Saved Identity
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('custom')}
          disabled={disabled}
          className={`
            px-3 py-1.5 rounded text-sm transition-colors
            ${effectiveMode === 'custom'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background-tertiary text-foreground-secondary hover:text-foreground'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          Custom
        </button>
      </div>

      {effectiveMode === 'saved' && (
        <div className="space-y-3">
          {identities.length === 0 && !showAddForm ? (
            <div className="text-sm text-foreground-secondary p-3 bg-background-tertiary/50 rounded">
              No saved identities yet.{' '}
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="text-primary hover:text-primary-hover"
              >
                Create one now
              </button>{' '}
              or use a custom identity.
            </div>
          ) : (
            <>
              {identities.length > 0 && (
                <div className="flex gap-2">
                  <select
                    value={value.identityId || defaultIdentity?.id || ''}
                    onChange={(e) => handleIdentityChange(e.target.value)}
                    disabled={disabled || showAddForm}
                    className="flex-1 px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
                  >
                    {identities.map((identity) => (
                      <option key={identity.id} value={identity.id}>
                        {identity.name} ({identity.gitEmail})
                        {identity.isDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                  {!showAddForm && (
                    <button
                      type="button"
                      onClick={() => setShowAddForm(true)}
                      disabled={disabled}
                      className="px-3 py-2 text-sm text-primary hover:text-primary-hover disabled:opacity-50"
                    >
                      + Add
                    </button>
                  )}
                </div>
              )}

              {/* Show selected identity details */}
              {selectedIdentity && !showAddForm && (
                <div className="p-3 bg-background-tertiary/50 rounded text-sm">
                  <div className="text-foreground-secondary">
                    Name: <span className="text-foreground">{selectedIdentity.gitName}</span>
                  </div>
                  <div className="text-foreground-secondary">
                    Email: <span className="text-foreground">{selectedIdentity.gitEmail}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Inline Add Identity Form */}
          {showAddForm && (
            <div className="p-3 bg-background-tertiary/50 rounded space-y-3 border border-primary/30">
              <div className="text-sm font-medium text-foreground">New Git Identity</div>

              {createError && (
                <div className="p-2 bg-error/20 border border-error/50 rounded text-error text-sm">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-xs text-foreground-secondary mb-1">
                  Display Name <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={newIdentityName}
                  onChange={(e) => setNewIdentityName(e.target.value)}
                  placeholder="Work, Personal, Open Source..."
                  disabled={isCreating}
                  className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground placeholder-foreground-tertiary focus:outline-none focus:border-primary disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-foreground-secondary mb-1">
                    Git Name <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={newGitName}
                    onChange={(e) => setNewGitName(e.target.value)}
                    placeholder="John Doe"
                    disabled={isCreating}
                    className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground placeholder-foreground-tertiary focus:outline-none focus:border-primary disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-foreground-secondary mb-1">
                    Git Email <span className="text-error">*</span>
                  </label>
                  <input
                    type="email"
                    value={newGitEmail}
                    onChange={(e) => setNewGitEmail(e.target.value)}
                    placeholder="john@example.com"
                    disabled={isCreating}
                    className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground placeholder-foreground-tertiary focus:outline-none focus:border-primary disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateIdentity}
                  disabled={isCreating}
                  className="px-3 py-1.5 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 rounded text-sm text-primary-foreground"
                >
                  {isCreating ? 'Creating...' : 'Create & Select'}
                </button>
                <button
                  type="button"
                  onClick={resetAddForm}
                  disabled={isCreating}
                  className="px-3 py-1.5 bg-background-tertiary hover:bg-background-input rounded text-sm text-foreground disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {effectiveMode === 'custom' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-foreground mb-1">
              Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={value.customName || ''}
              onChange={(e) => handleCustomNameChange(e.target.value)}
              placeholder="Your Name"
              disabled={disabled}
              className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary focus:outline-none focus:border-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm text-foreground mb-1">
              Email <span className="text-error">*</span>
            </label>
            <input
              type="email"
              value={value.customEmail || ''}
              onChange={(e) => handleCustomEmailChange(e.target.value)}
              placeholder="your@email.com"
              disabled={disabled}
              className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary focus:outline-none focus:border-primary disabled:opacity-50"
            />
            <p className="text-xs text-foreground-tertiary mt-1">
              This email will be used for git commits in this repository.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Helper function to validate a git identity value
 * For 'saved' mode: valid if identityId is set OR there's a default identity available
 * For 'custom' mode: requires both name and valid email
 */
export function isGitIdentityValid(value: GitIdentityValue, identities?: GitIdentityInfo[]): boolean {
  if (value.mode === 'custom') {
    return !!(
      value.customName?.trim() &&
      value.customEmail?.trim() &&
      value.customEmail.includes('@')
    );
  }
  // 'saved' mode (or any other for backwards compatibility)
  // Valid if explicit identity selected, or if there's a default to fall back to
  if (value.identityId) return true;
  if (identities && identities.length > 0) return true;
  return false;
}

/**
 * Get display text for a git identity value
 */
export function getGitIdentityDisplayText(
  value: GitIdentityValue,
  identities: GitIdentityInfo[]
): string {
  if (value.mode === 'custom') {
    if (value.customName && value.customEmail) {
      return `${value.customName} (${value.customEmail})`;
    }
    return 'Enter custom identity';
  }
  // 'saved' mode (or any other for backwards compatibility)
  const defaultIdentity = identities.find((i) => i.isDefault) || identities[0];
  const identity = value.identityId
    ? identities.find((i) => i.id === value.identityId)
    : defaultIdentity;
  return identity ? `${identity.name} (${identity.gitEmail})` : 'No identity';
}
