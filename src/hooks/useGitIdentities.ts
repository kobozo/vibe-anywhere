'use client';

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

export interface GitIdentityInfo {
  id: string;
  userId: string;
  name: string;
  gitName: string;
  gitEmail: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGitIdentityInput {
  name: string;
  gitName: string;
  gitEmail: string;
  isDefault?: boolean;
}

export interface UpdateGitIdentityInput {
  name?: string;
  gitName?: string;
  gitEmail?: string;
  isDefault?: boolean;
}

export function useGitIdentities() {
  const { token } = useAuth();
  const [identities, setIdentities] = useState<GitIdentityInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchIdentities = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/git-identities', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch git identities');
      }

      const { data } = await response.json();
      setIdentities(data.identities);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const createIdentity = useCallback(
    async (input: CreateGitIdentityInput) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/git-identities', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to create git identity');
      }

      const { data } = await response.json();

      // If this was set as default, update other identities
      if (input.isDefault) {
        setIdentities((prev) => [
          ...prev.map((i) => ({ ...i, isDefault: false })),
          data.identity,
        ]);
      } else {
        setIdentities((prev) => [...prev, data.identity]);
      }

      return data.identity as GitIdentityInfo;
    },
    [token]
  );

  const updateIdentity = useCallback(
    async (identityId: string, input: UpdateGitIdentityInput) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/git-identities/${identityId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to update git identity');
      }

      const { data } = await response.json();

      // Update local state
      if (input.isDefault) {
        // If setting as default, update all identities
        setIdentities((prev) =>
          prev.map((i) => ({
            ...i,
            isDefault: i.id === identityId,
            ...(i.id === identityId ? data.identity : {}),
          }))
        );
      } else {
        setIdentities((prev) =>
          prev.map((i) => (i.id === identityId ? data.identity : i))
        );
      }

      return data.identity as GitIdentityInfo;
    },
    [token]
  );

  const deleteIdentity = useCallback(
    async (identityId: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/git-identities/${identityId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to delete git identity');
      }

      setIdentities((prev) => prev.filter((i) => i.id !== identityId));
    },
    [token]
  );

  const setDefaultIdentity = useCallback(
    async (identityId: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/git-identities/${identityId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isDefault: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to set default identity');
      }

      // Update local state
      setIdentities((prev) =>
        prev.map((i) => ({
          ...i,
          isDefault: i.id === identityId,
        }))
      );
    },
    [token]
  );

  const getDefaultIdentity = useCallback(() => {
    return identities.find((i) => i.isDefault) || null;
  }, [identities]);

  return {
    identities,
    isLoading,
    error,
    fetchIdentities,
    createIdentity,
    updateIdentity,
    deleteIdentity,
    setDefaultIdentity,
    getDefaultIdentity,
  };
}
