'use client';

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

export interface Secret {
  id: string;
  name: string;
  envKey: string;
  description?: string;
  templateWhitelist: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SecretInput {
  name: string;
  envKey: string;
  value: string;
  description?: string;
  templateWhitelist: string[];
}

export function useSecrets() {
  const { token } = useAuth();
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSecrets = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/secrets', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch secrets');
      }

      const { data } = await response.json();
      setSecrets(data.secrets);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const createSecret = useCallback(
    async (input: SecretInput) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/secrets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to create secret');
      }

      const { data } = await response.json();
      setSecrets((prev) => [...prev, data.secret]);
      return data.secret as Secret;
    },
    [token]
  );

  const updateSecret = useCallback(
    async (secretId: string, updates: Partial<SecretInput>) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/secrets/${secretId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to update secret');
      }

      const { data } = await response.json();
      setSecrets((prev) =>
        prev.map((s) => (s.id === secretId ? data.secret : s))
      );
      return data.secret as Secret;
    },
    [token]
  );

  const deleteSecret = useCallback(
    async (secretId: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/secrets/${secretId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to delete secret');
      }

      setSecrets((prev) => prev.filter((s) => s.id !== secretId));
    },
    [token]
  );

  return {
    secrets,
    isLoading,
    error,
    fetchSecrets,
    createSecret,
    updateSecret,
    deleteSecret,
  };
}
