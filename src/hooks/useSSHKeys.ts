'use client';

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

export interface SSHKeyInfo {
  id: string;
  userId: string | null;
  repositoryId: string | null;
  name: string;
  publicKey: string;
  keyType: 'ed25519' | 'rsa' | 'ecdsa';
  fingerprint: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useSSHKeys() {
  const { token } = useAuth();
  const [keys, setKeys] = useState<SSHKeyInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchKeys = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ssh-keys', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch SSH keys');
      }

      const { data } = await response.json();
      setKeys(data.keys);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const generateKey = useCallback(
    async (name: string, keyType: 'ed25519' | 'rsa' | 'ecdsa' = 'ed25519') => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/ssh-keys', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'generate',
          name,
          keyType,
        }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to generate SSH key');
      }

      const { data } = await response.json();
      setKeys((prev) => [...prev, data.key]);
      return data.key as SSHKeyInfo;
    },
    [token]
  );

  const deleteKey = useCallback(
    async (keyId: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/ssh-keys/${keyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to delete SSH key');
      }

      setKeys((prev) => prev.filter((k) => k.id !== keyId));
    },
    [token]
  );

  const setDefaultKey = useCallback(
    async (keyId: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/ssh-keys/${keyId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isDefault: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to set default key');
      }

      // Update local state
      setKeys((prev) =>
        prev.map((k) => ({
          ...k,
          isDefault: k.id === keyId,
        }))
      );
    },
    [token]
  );

  return {
    keys,
    isLoading,
    error,
    fetchKeys,
    generateKey,
    deleteKey,
    setDefaultKey,
  };
}
