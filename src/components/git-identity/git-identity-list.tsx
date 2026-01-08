'use client';

import React, { useState, useEffect } from 'react';
import { useGitIdentities, type GitIdentityInfo } from '@/hooks/useGitIdentities';

interface GitIdentityFormState {
  name: string;
  gitName: string;
  gitEmail: string;
}

const initialFormState: GitIdentityFormState = {
  name: '',
  gitName: '',
  gitEmail: '',
};

/**
 * GitIdentityList - Settings component for managing git identities
 *
 * Features:
 * - List all saved identities with default badge
 * - Add new identity inline
 * - Edit existing identities
 * - Delete identities
 * - Set default identity
 */
export function GitIdentityList() {
  const {
    identities,
    isLoading,
    fetchIdentities,
    createIdentity,
    updateIdentity,
    deleteIdentity,
    setDefaultIdentity,
  } = useGitIdentities();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<GitIdentityFormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIdentities();
  }, [fetchIdentities]);

  const handleAddClick = () => {
    setShowAddForm(true);
    setEditingId(null);
    setFormState(initialFormState);
    setError(null);
  };

  const handleEditClick = (identity: GitIdentityInfo) => {
    setEditingId(identity.id);
    setShowAddForm(false);
    setFormState({
      name: identity.name,
      gitName: identity.gitName,
      gitEmail: identity.gitEmail,
    });
    setError(null);
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingId(null);
    setFormState(initialFormState);
    setError(null);
  };

  const handleSubmit = async () => {
    // Validate
    if (!formState.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formState.gitName.trim()) {
      setError('Git name is required');
      return;
    }
    if (!formState.gitEmail.trim() || !formState.gitEmail.includes('@')) {
      setError('Valid email is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (editingId) {
        await updateIdentity(editingId, {
          name: formState.name.trim(),
          gitName: formState.gitName.trim(),
          gitEmail: formState.gitEmail.trim(),
        });
      } else {
        await createIdentity({
          name: formState.name.trim(),
          gitName: formState.gitName.trim(),
          gitEmail: formState.gitEmail.trim(),
          isDefault: identities.length === 0, // First identity is default
        });
      }
      handleCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save identity');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (identity: GitIdentityInfo) => {
    if (!confirm(`Delete identity "${identity.name}"?`)) return;

    try {
      await deleteIdentity(identity.id);
    } catch (err) {
      console.error('Failed to delete identity:', err);
    }
  };

  const handleSetDefault = async (identity: GitIdentityInfo) => {
    try {
      await setDefaultIdentity(identity.id);
    } catch (err) {
      console.error('Failed to set default:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground-secondary">
          Manage git identities for your repositories. Each identity includes a name and email for commits.
        </p>
        <button
          onClick={showAddForm ? handleCancel : handleAddClick}
          className="text-sm text-primary hover:text-primary-hover"
        >
          {showAddForm ? 'Cancel' : '+ Add Identity'}
        </button>
      </div>

      {/* Add/Edit Form */}
      {(showAddForm || editingId) && (
        <div className="p-4 bg-background-tertiary/50 rounded space-y-3">
          <div className="text-sm font-medium text-foreground">
            {editingId ? 'Edit Identity' : 'New Identity'}
          </div>

          {error && (
            <div className="p-2 bg-error/20 border border-error/50 rounded text-error text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-foreground-secondary mb-1">
              Display Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={formState.name}
              onChange={(e) => setFormState({ ...formState, name: e.target.value })}
              placeholder="Work, Personal, Open Source..."
              className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground placeholder-foreground-tertiary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-foreground-secondary mb-1">
                Git Name <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={formState.gitName}
                onChange={(e) => setFormState({ ...formState, gitName: e.target.value })}
                placeholder="John Doe"
                className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground placeholder-foreground-tertiary"
              />
            </div>
            <div>
              <label className="block text-xs text-foreground-secondary mb-1">
                Git Email <span className="text-error">*</span>
              </label>
              <input
                type="email"
                value={formState.gitEmail}
                onChange={(e) => setFormState({ ...formState, gitEmail: e.target.value })}
                placeholder="john@example.com"
                className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground placeholder-foreground-tertiary"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-3 py-1.5 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 rounded text-sm text-primary-foreground"
            >
              {isSubmitting ? 'Saving...' : editingId ? 'Update' : 'Add Identity'}
            </button>
            <button
              onClick={handleCancel}
              disabled={isSubmitting}
              className="px-3 py-1.5 bg-background-tertiary hover:bg-background-input rounded text-sm text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Identities List */}
      {isLoading && identities.length === 0 ? (
        <div className="text-foreground-tertiary text-sm py-4">Loading identities...</div>
      ) : identities.length === 0 && !showAddForm ? (
        <div className="text-foreground-tertiary text-sm py-4">
          No git identities yet. Create one to use for repository commits.
        </div>
      ) : (
        <div className="space-y-2">
          {identities.map((identity) => (
            <div
              key={identity.id}
              className={`
                flex items-center gap-3 p-3 rounded group
                ${editingId === identity.id ? 'bg-primary/10 border border-primary/30' : 'bg-background-tertiary/30'}
              `}
            >
              <div className="w-8 h-8 flex items-center justify-center bg-primary/20 rounded-full text-primary">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground font-medium">{identity.name}</span>
                  {identity.isDefault && (
                    <span className="text-xs px-1.5 py-0.5 bg-success/20 text-success rounded">
                      default
                    </span>
                  )}
                </div>
                <div className="text-xs text-foreground-tertiary">
                  {identity.gitName} &lt;{identity.gitEmail}&gt;
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {!identity.isDefault && (
                  <button
                    onClick={() => handleSetDefault(identity)}
                    className="text-xs text-primary hover:text-primary-hover"
                  >
                    Set Default
                  </button>
                )}
                <button
                  onClick={() => handleEditClick(identity)}
                  className="text-xs text-foreground-secondary hover:text-foreground"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(identity)}
                  className="text-xs text-foreground-tertiary hover:text-error"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
